const {DIRECTION, SORT} = require("../constants/monogodb-constants");
module.exports = {
    getSortDirection(direction) {
        if (!direction) return DIRECTION.DESC;
        if (direction.toLowerCase() === SORT.ASC) return DIRECTION.ASC;
        return DIRECTION.DESC;
    }
}