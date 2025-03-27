export function applySpacers(str, spacers) {
    let res = '';

    for (let i = 0; i < str.length; i++) {
        res += str.charAt(i);

        if (spacers > 0) {
            // Get the least significant bit
            let bit = spacers & 1;

            if (bit === 1) {
                res += '•';
            }

            // Right shift the number to process the next bit
            spacers >>= 1;
        }
    }

    return res;
}

export function getSpacersVal(str) {
    let res = 0;
    let spacersCnt = 0;
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charAt(i);
        
        if (char === '•') {
            res += 1 << (i - 1 - spacersCnt);
            spacersCnt++;
        } 
    }

    return res;
}

export function removeSpacers(rune) {
    return rune.replace(/[•]+/g, "");
}

