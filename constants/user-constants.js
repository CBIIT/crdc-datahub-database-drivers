module.exports = Object.freeze({
    USER: {
        ROLES: {
            ADMIN: "Admin",
            USER: "User",
            CURATOR: "Data Curator",
            FEDERAL_LEAD: "Federal Lead",
            DC_POC: "Data Commons POC",
            ORG_OWNER: "Organization Owner",
            SUBMITTER: "Submitter",
            //The below roles are not yet used
            DC_OWNER: "DC_OWNER",
            CONCIERGE: "Concierge",
        },
        STATUSES: {
            ACTIVE: "Active",
            INACTIVE: "Inactive",
            DISABLED: "Disabled"
        },
        IDPS: {
            NIH: "NIH",
            LOGIN_GOV: "Login.gov"
        }
    },
    NOT_APPLICABLE: "Not Applicable"
});
