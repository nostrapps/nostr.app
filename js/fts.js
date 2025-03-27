class None {
    constructor() {}

    isSome() {
        return false;
    }

    map(f) {
        return new None();
    }

    value() {
        return null;
    }
}

class Some {
    constructor(value) {
        this._value = value;
    }

    isSome() {
        return true;
    }

    map(f) {
        return new Some(f(this.value()));
    }

    value() {
        return this._value;
    }
}

export function some(value) {
    return new Some(value);
}

export function none() {
    return new None();
}

// Option is just a union of None and Some
export const Option = {
    None,
    Some
};

