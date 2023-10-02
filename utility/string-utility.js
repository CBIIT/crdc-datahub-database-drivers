const {ERROR} = require("../constants/error-constants");
const parseJsonString = (jsonString) => {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error(ERROR.JSON_PARSING, error);
        return null;
    }
};

module.exports = {
    parseJsonString
}