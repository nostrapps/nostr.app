import { base26Decode, base26Encode } from './base26.js'
import { encodeLEB128, decodeLEB128 } from './leb128.js'
import { removeSpacers, getSpacersVal } from './spacers.js'
import { some, none, Option } from './fts.js';
import { chunks, toPushData } from "./utils.js";
import { Transaction, script } from 'bitcoinjs-lib'; // Make sure this is correctly installed and imported


class RuneId {
  constructor(block, idx) {
    this.block = block;
    this.idx = idx;
  }

  next(block, idx) {
    if (block > BigInt(Number.MAX_SAFE_INTEGER)) {
      return none();
    }

    if (idx > BigInt(Number.MAX_SAFE_INTEGER)) {
      return none();
    }

    let b = BigInt(this.block) + block;

    if (b > BigInt(Number.MAX_SAFE_INTEGER)) {
      return none();
    }

    let i = block === 0n ? BigInt(this.idx) + idx : idx;

    if (i > BigInt(Number.MAX_SAFE_INTEGER)) {
      return none();
    }

    return some(new RuneId(Number(b), Number(i)));
  }
}

class Edict {
  constructor(id, amount, output) {
    this.id = id;
    this.amount = amount;
    this.output = output;
  }

  static from_integers(tx, id, amount, output) {
    if (output > 4294967295n || output < 0n) {
      return none();
    }

    if (Number(output) > tx.outs.length) {
      return none();
    }

    return some(new Edict(id, amount, Number(output)));
  }
}

const Flag = {
  Etching: 0,
  Terms: 1,
  Turbo: 2,
  Cenotaph: 127,
};

export const Tag = {
  Body: 0,
  Flags: 2,
  Rune: 4,
  Premine: 6,
  Cap: 8,
  Amount: 10,
  HeightStart: 12,
  HeightEnd: 14,
  OffsetStart: 16,
  OffsetEnd: 18,
  Mint: 20,
  Pointer: 22,
  Cenotaph: 126,
  Divisibility: 1,
  Spacers: 3,
  Symbol: 5,
  Glyph: 123,   // Added new field 'Glyph'
  Nop: 127,
};

const Flaw = {
  EdictOutput: 'EdictOutput',
  EdictRuneId: 'EdictRuneId',
  InvalidScript: 'InvalidScript',
  Opcode: 'Opcode',
  SupplyOverflow: 'SupplyOverflow',
  TrailingIntegers: 'TrailingIntegers',
  TruncatedField: 'TruncatedField',
  UnrecognizedEvenTag: 'UnrecognizedEvenTag',
  UnrecognizedFlag: 'UnrecognizedFlag',
  Varint: 'Varint',
};

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class Terms {
  constructor(amount, cap, height, offset) {
    this.amount = amount;
    this.cap = cap;
    this.height = height;
    this.offset = offset;
  }
}

class Rune {
  constructor(value) {
    this.value = value;
  }

  get name() {
    return Rune.toName(this.value);
  }

  static toName(s) {
    return base26Decode(s);
  }

  static fromName(name) {
    return new Rune(base26Encode(removeSpacers(name)));
  }

  toString() {
    return this.name;
  }
}

class Etching {
  static MAX_DIVISIBILITY = 38;
  static MAX_SPACERS = 0b00000111_11111111_11111111_11111111;

  constructor(divisibility, premine, glyph, rune, spacers, symbol, terms, turbo) {
    this.divisibility = divisibility;
    this.premine = premine;
    this.glyph = glyph;   // Added new field 'glyph'
    this.rune = rune;
    this.spacers = spacers;
    this.symbol = symbol;
    this.terms = terms;
    this.turbo = turbo;
  }
}

export class Runestone {
  static MAGIC_NUMBER = 93;

  constructor(edicts = [], etching, mint, pointer) {
    this.edicts = edicts;
    this.etching = etching;
    this.mint = mint;
    this.pointer = pointer;
  }

  static create(json, type = 'etch') {
    if (type === 'etch') {
      const runename = Rune.fromName(json.name);

      const terms = new Terms(
        json.amount,
        json.cap,
        new Range(
          json.startHeight ? some(json.startHeight) : none(),
          json.endHeight ? some(json.endHeight) : none()
        ),
        new Range(
          json.startOffset ? some(json.startOffset) : none(),
          json.endOffset ? some(json.endOffset) : none()
        )
      );

      const divisibility = json.divisibility ? some(json.divisibility) : none();
      const premine = json.premine ? some(json.premine) : none();
      const glyph = json.glyph ? some(json.glyph) : none();   // Added new field 'glyph'
      const spacers = json.name.indexOf('•') > -1 ? some(getSpacersVal(json.name)) : none();
      const symbol = json.symbol ? some(json.symbol) : none();
      const pointer = typeof json.pointer === 'number' ? some(json.pointer) : none();

      const etching = new Etching(
        divisibility,
        premine,
        glyph,   // Added new field 'glyph'
        some(runename),
        spacers,
        symbol,
        some(terms),
        true
      );

      return new Runestone([], some(etching), none(), pointer);
    } else if (type === 'mint') {
      const pointer = typeof json.pointer === 'number' ? some(json.pointer) : none();
      return new Runestone([], none(), some(new RuneId(json.block, json.txIdx)), pointer);
    } else {
      throw new Error(`not ${type} support now`);
    }
  }

  static decipher(rawTx) {
    // console.log(rawTx)
    const tx = Transaction.fromHex(rawTx);
    // console.log(tx)
    const payload = Runestone.payload(tx);

    if (payload.isSome()) {
      const integers = Runestone.integers(payload.value());
      const message = Message.from_integers(tx, integers.value());
      const etching = message.getEtching();
      const mint = message.getMint();
      const pointer = message.getPointer();

      // console.log('message', message)

      return some(new Runestone(message.edicts, etching, mint, pointer));
    }

    return none();
  }

  encipher() {
    const msg = this.toMessage();
    const msgBuff = msg.toBuffer();
    const prefix = Buffer.from('6a5d', 'hex'); // OP_RETURN OP_13

    let pushNum;
    if (msgBuff.length < 0x4c) {
      pushNum = Buffer.alloc(1);
      pushNum.writeUInt8(msgBuff.length);
    } else if (msgBuff.length < 0x100) {
      pushNum = Buffer.alloc(2);
      pushNum.writeUInt8(0x4c);
      pushNum.writeUInt8(msgBuff.length);
    } else if (msgBuff.length < 0x10000) {
      pushNum = Buffer.alloc(3);
      pushNum.writeUInt8(0x4d);
      pushNum.writeUInt16LE(msgBuff.length);
    } else if (msgBuff.length < 0x100000000) {
      pushNum = Buffer.alloc(5);
      pushNum.writeUInt8(0x4e);
      pushNum.writeUInt32LE(msgBuff.length);
    } else {
      throw new Error("runestone too big!");
    }

    return Buffer.concat([prefix, pushNum, msgBuff]);
  }

  static payload(tx) {
    for (const output of tx.outs) {
      const ls = script.decompile(output.script);


      if (ls[0] !== script.OPS.OP_RETURN) {
        continue;
      }



      if (ls[1] !== Runestone.MAGIC_NUMBER) {
        continue;
      }

      for (let i = 2; i < ls.length; i++) {
        const element = ls[i];

        if (element instanceof Uint8Array) {
          return some(Array.from(element));
        }
        return none();
      }

      return none();
    }

    return none();
  }

  static integers(payload) {
    let integers = [];
    let i = 0;

    while (i < payload.length) {
      let { n, len } = decodeLEB128(payload.slice(i));
      integers.push(n);
      i += len;
    }

    return some(integers);
  }

  toMessage() {
    let fields = new Map();

    const etching = this.etching.value();

    if (etching) {
      let flags = 1;

      if (etching.terms.isSome()) {
        let mask = 1 << Flag.Terms;
        flags |= mask;
      }

      if (etching.turbo) {
        let mask = 1 << Flag.Turbo;
        flags |= mask;
      }

      fields.set(Tag.Flags, [BigInt(flags)]);

      const rune = etching.rune.value();

      if (rune !== null) {
        fields.set(Tag.Rune, [BigInt(rune.value)]);
      }

      const divisibility = etching.divisibility.value();

      if (divisibility !== null) {
        fields.set(Tag.Divisibility, [BigInt(divisibility)]);
      }

      const spacers = etching.spacers.value();

      if (spacers !== null) {
        fields.set(Tag.Spacers, [BigInt(spacers)]);
      }

      const symbol = etching.symbol.value();

      if (symbol !== null) {
        fields.set(Tag.Symbol, [BigInt(symbol.charCodeAt(0))]);
      }

      const premine = etching.premine.value();

      if (premine !== null) {
        fields.set(Tag.Premine, [BigInt(premine)]);
      }

      const glyph = etching.glyph.value();   // Added new field 'glyph'

      if (glyph !== null) {
        fields.set(Tag.Glyph, [BigInt(glyph)]);   // Added new field 'glyph'
      }

      const terms = etching.terms.value();

      if (terms !== null) {
        fields.set(Tag.Amount, [BigInt(terms.amount)]);
        fields.set(Tag.Cap, [BigInt(terms.cap)]);

        const heightStart = terms.height.start.value();

        if (heightStart) {
          fields.set(Tag.HeightStart, [BigInt(heightStart)]);
        }

        const heightEnd = terms.height.end.value();

        if (heightEnd) {
          fields.set(Tag.HeightEnd, [BigInt(heightEnd)]);
        }

        const offsetStart = terms.offset.start.value();

        if (offsetStart) {
          fields.set(Tag.OffsetStart, [BigInt(offsetStart)]);
        }

        const offsetEnd = terms.offset.end.value();

        if (offsetEnd) {
          fields.set(Tag.OffsetEnd, [BigInt(offsetEnd)]);
        }
      }
    }

    const mint = this.mint.value();

    if (mint !== null) {
      fields.set(Tag.Mint, [BigInt(mint.block), BigInt(mint.idx)]);
    }

    const pointer = this.pointer.value();

    if (pointer !== null) {
      fields.set(Tag.Pointer, [BigInt(pointer)]);
    }

    return new Message(fields, this.edicts, 0);
  }
}

class Message {
  constructor(fields = new Map(), edicts = [], flaws = 0) {
    this.fields = fields;
    this.edicts = edicts;
    this.flaws = flaws;
  }

  static from_integers(tx, integers) {
    let fields = new Map();
    let edicts = [];
    let flaws = 0;

    let isBody = false;

    for (let i = 0; i < integers.length;) {
      let tag = integers[i];
      if (Number(tag) === Tag.Body) {
        isBody = true;
        i += 1;
        continue;
      }

      if (!isBody) {
        let val = integers[i + 1];
        const vals = fields.get(Number(tag)) || [];
        vals.push(val);

        fields.set(Number(tag), vals);

        i += 2;
      } else {
        let id = new RuneId(0, 0);

        for (const chunk of chunks(integers.slice(i), 4)) {
          if (chunk.length != 4) {
            flaws |= Flaw.TrailingIntegers;
            break;
          }

          let next = id.next(chunk[0], chunk[1]);

          if (!next.isSome()) {
            flaws |= Flaw.EdictRuneId;
            break;
          }

          const edict = Edict.from_integers(tx, next.value(), chunk[2], chunk[3]);

          if (!edict.isSome()) {
            flaws |= Flaw.EdictOutput;
            break;
          }

          id = next.value();
          edicts.push(edict.value());
        }

        i += 4;
      }
    }

    return new Message(fields, edicts, flaws);
  }

  addFieldVal(tag, val) {
    const vals = this.fields.get(Number(tag)) || [];
    vals.push(val);

    this.fields.set(Number(tag), vals);
  }

  addEdict(edict) {
    this.edicts.push(edict);
  }

  toBuffer() {
    const buffArr = [];

    for (const [tag, vals] of this.fields) {
      for (const val of vals) {
        const tagBuff = Buffer.alloc(1);
        tagBuff.writeUInt8(tag);
        buffArr.push(tagBuff);

        buffArr.push(Buffer.from(encodeLEB128(val)));
      }
    }

    if (this.edicts.length > 0) {
      buffArr.push(Buffer.from('00', 'hex'));
      this.edicts.sort((a, b) => {
        if (a.id.block == b.id.block) {
          return a.id.idx - b.id.idx;
        }
        return a.id.block - b.id.block;
      });
      let lastBlockHeight = 0n;
      let lastTxIdx = 0n;
      for (let i = 0; i < this.edicts.length; i++) {
        const edict = this.edicts[i];
        if (i == 0) {
          lastBlockHeight = BigInt(edict.id.block);
          lastTxIdx = BigInt(edict.id.idx);
          buffArr.push(Buffer.from(encodeLEB128(lastBlockHeight)));
          buffArr.push(Buffer.from(encodeLEB128(lastTxIdx)));
        } else {
          const currBlockHeight = BigInt(edict.id.block);
          const currTxIdx = BigInt(edict.id.idx);

          if (currBlockHeight == lastBlockHeight) {
            const deltaTxIdx = currTxIdx - lastTxIdx;
            lastTxIdx = currTxIdx;

            buffArr.push(Buffer.from(encodeLEB128(0n)));
            buffArr.push(Buffer.from(encodeLEB128(deltaTxIdx)));
          } else {
            const deltaBlockHeight = currBlockHeight - lastBlockHeight;
            lastBlockHeight = currBlockHeight;
            lastTxIdx = currTxIdx;

            buffArr.push(Buffer.from(encodeLEB128(deltaBlockHeight)));
            buffArr.push(Buffer.from(encodeLEB128(currTxIdx)));
          }
        }

        buffArr.push(Buffer.from(encodeLEB128(BigInt(edict.amount))));
        buffArr.push(Buffer.from(encodeLEB128(BigInt(edict.output))));
      }
    }

    return Buffer.concat(buffArr);
  }

  getFlags() {
    return Number(this.fields.get(Tag.Flags));
  }

  hasFlags(flag) {
    const flags = this.getFlags();
    const mask = 1 << flag;
    return (flags & mask) != 0;
  }

  getMint() {
    if (!this.fields.has(Tag.Mint)) {
      return none();
    }

    const [block, tx] = this.fields.get(Tag.Mint);

    return some(new RuneId(Number(block), Number(tx)));
  }

  getEtching() {
    if (!this.hasFlags(Flag.Etching)) {
      return none();
    }

    const divisibility = this.getDivisibility();
    const premine = this.getPremine();
    const glyph = this.getGlyph();   // Added new field 'glyph'
    const rune = this.getRune();
    const spacers = this.getSpacers();
    const symbol = this.getSymbol();
    const terms = this.getTerms();
    const turbo = this.hasFlags(Flag.Turbo);

    return some(new Etching(divisibility, premine, glyph, rune, spacers, symbol, terms, turbo));
  }

  getDivisibility() {
    if (!this.fields.has(Tag.Divisibility)) {
      return none();
    }
    const [divisibility] = this.fields.get(Tag.Divisibility);

    if (divisibility > Etching.MAX_DIVISIBILITY) {
      throw new Error("invalid divisibility");
    }

    return some(Number(divisibility));
  }

  getPremine() {
    if (!this.fields.has(Tag.Premine)) {
      return none();
    }
    const [premine] = this.fields.get(Tag.Premine);

    return some(Number(premine));
  }

  getGlyph() {   // Added new field 'glyph'
    if (!this.fields.has(Tag.Glyph)) {
      return none();
    }
    const [glyph] = this.fields.get(Tag.Glyph);

    return some(Number(glyph));
  }

  getRune() {
    if (!this.fields.has(Tag.Rune)) {
      return none();
    }
    const [rune] = this.fields.get(Tag.Rune);

    return some(new Rune(rune));
  }

  getSpacers() {
    if (!this.fields.has(Tag.Spacers)) {
      return none();
    }
    const [spacers] = this.fields.get(Tag.Spacers);
    if (spacers > Etching.MAX_SPACERS) {
      throw new Error("invalid spacers");
    }
    return some(Number(spacers));
  }

  getHeightStart() {
    if (!this.fields.has(Tag.HeightStart)) {
      return none();
    }
    const [heightStart] = this.fields.get(Tag.HeightStart);

    return some(Number(heightStart));
  }

  getHeightEnd() {
    if (!this.fields.has(Tag.HeightEnd)) {
      return none();
    }
    const [heightEnd] = this.fields.get(Tag.HeightEnd);

    return some(Number(heightEnd));
  }

  getOffsetStart() {
    if (!this.fields.has(Tag.OffsetStart)) {
      return none();
    }
    const [offsetStart] = this.fields.get(Tag.OffsetStart);

    return some(Number(offsetStart));
  }

  getOffsetEnd() {
    if (!this.fields.has(Tag.OffsetEnd)) {
      return none();
    }
    const [offsetEnd] = this.fields.get(Tag.OffsetEnd);

    return some(Number(offsetEnd));
  }

  getCap() {
    if (!this.fields.has(Tag.Cap)) {
      return none();
    }
    const [cap] = this.fields.get(Tag.Cap);

    return some(Number(cap));
  }

  getAmount() {
    if (!this.fields.has(Tag.Amount)) {
      return none();
    }
    const [amount] = this.fields.get(Tag.Amount);

    return some(Number(amount));
  }

  getSymbol() {
    if (!this.fields.has(Tag.Symbol)) {
      return none();
    }
    const [symbol] = this.fields.get(Tag.Symbol);

    return some(String.fromCharCode(Number(symbol)));
  }

  getTerms() {
    if (!this.hasFlags(Flag.Terms)) {
      return none();
    }

    const cap = this.getCap();

    if (!cap.isSome()) {
      throw new Error("no cap field");
    }

    const amount = this.getAmount();

    if (!amount.isSome()) {
      throw new Error("no amount field");
    }

    const heightStart = this.getHeightStart();
    const heightEnd = this.getHeightEnd();
    const offsetStart = this.getOffsetStart();
    const offsetEnd = this.getOffsetEnd();

    const height = new Range(heightStart, heightEnd);
    const offset = new Range(offsetStart, offsetEnd);

    return some(new Terms(amount.value(), cap.value(), height, offset));
  }

  getPointer() {
    if (!this.fields.has(Tag.Pointer)) {
      return none();
    }

    const [pointer] = this.fields.get(Tag.Pointer);

    return some(Number(pointer));
  }
}

class EtchInscription {
  static Tag = {
    CONTENT_TYPE: 1,
    POINTER: 2,
    PARENT: 3,
    METADATA: 5,
    METAPROTOCOL: 7,
    CONTENT_ENCODING: 9,
    DELEGATE: 11,
    RUNE: 13,
  };

  constructor(fields = new Map(), data = Buffer.alloc(0)) {
    this.fields = fields;
    this.data = data;
  }

  setContent(contentType, data) {
    this.fields.set(1, Buffer.from(contentType, 'utf8'));
    this.data = data;
  }

  setRune(rune) {
    const n = base26Encode(removeSpacers(rune));
    let nstr = n.toString(16);

    if (nstr.length % 2 === 1) {
      nstr = '0' + nstr;
    }

    this.setField(EtchInscription.Tag.RUNE, Buffer.from(nstr, 'hex').reverse());
  }

  setField(field, val) {
    this.fields.set(field, val);
  }

  static decipher(rawTx, inputIdx) {
    const tx = Transaction.fromHex(rawTx);
    const witness = tx.ins[inputIdx].witness;
    const tapscript = witness[1];
    const ls = script.decompile(tapscript);

    const fields = new Map();
    const dataChunks = [];

    let isData = false;
    for (let i = 5; i < ls.length - 1;) {
      const chunk = ls[i];

      if (chunk === 0) {
        isData = true;
        i++;
        continue;
      } else if (isData) {
        dataChunks.push(chunk);
        i++;
      } else {
        const tag = (chunk - 80);
        const val = ls[i + 1];
        if (typeof val === 'number') {
          const buff = Buffer.alloc(1);
          buff.writeUInt8(val);
          fields.set(tag, buff);
        } else {
          fields.set(tag, val);
        }
        i += 2;
      }
    }

    return new EtchInscription(fields, Buffer.concat(dataChunks));
  }

  encipher() {
    const res = [];

    if (this.data && this.data.length > 0) {
      res.push(
        Buffer.from('0063036f7264', 'hex')
      );

      Array.from(this.fields.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([tag, val]) => {
          const tagBuff = Buffer.alloc(1);
          tagBuff.writeUInt8(tag);
          res.push(Buffer.from('01', 'hex'));
          res.push(tagBuff);

          if (val.length !== 1 || val[0] !== 0x00) {
            res.push(toPushData(val));
          } else {
            res.push(val);
          }
        });

      res.push(Buffer.from('00', 'hex'));

      const dataChunks = chunks(Array.from(this.data), 520);
      for (const chunk of dataChunks) {
        res.push(toPushData(Buffer.from(chunk)));
      }
    } else {
      res.push(
        Buffer.from('0063', 'hex')
      );
      const rune = this.fields.get(EtchInscription.Tag.RUNE);
      if (!rune) {
        throw new Error(`No rune found!`);
      }
      res.push(toPushData(rune));
    }

    res.push(Buffer.from('68', 'hex'));

    return Buffer.concat(res);
  }
}
