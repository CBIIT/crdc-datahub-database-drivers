const {getCurrentTime} = require("../utility/time-utility");
const {v4} = require("uuid");
const {isUndefined} = require("../../utility/string-util");

class ApprovedStudies {
    constructor(studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess) {
        this._id = v4();
        this.studyName = studyName;
        this.studyAbbreviation = studyAbbreviation;
        if (dbGaPID) {
            this.dbGaPID = dbGaPID;
        }
        // Optional
        if (organizationName) {
            this.originalOrg = organizationName;
        }
        if (ORCID) {
            this.ORCID = ORCID;
        }
        if (!isUndefined(controlledAccess)) {
            this.controlledAccess = controlledAccess;
        }
        if (PI) {
            this.PI = PI;
        }

        if (!isUndefined(openAccess)) {
            this.openAccess = openAccess;
        }
        this.createdAt = this.updatedAt = getCurrentTime();
    }

    static createApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization, controlledAccess, ORCID, PI, openAccess) {
        return new ApprovedStudies(studyName, studyAbbreviation, dbGaPID, organization, controlledAccess, ORCID, PI, openAccess);
    }
}

module.exports = {
    ApprovedStudies
}
