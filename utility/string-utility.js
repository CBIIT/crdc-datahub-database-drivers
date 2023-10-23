const {ERROR} = require("../constants/error-constants");
const parseJsonString = (jsonString) => {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error(ERROR.JSON_PARSING, error);
        return null;
    }
};

const replaceMessageVariables = (input, messageVariables) => {
    for (let key in messageVariables){
        // message variable must start with $
        input = input.replace(`$${key}`, messageVariables[key]);
    }
    return input;
}

module.exports = {
    parseJsonString,
    replaceMessageVariables
}