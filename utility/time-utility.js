module.exports = {
    getCurrentTime() {
        return new Date();
    },
    subtractDaysFromNow(days) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - days);
        return currentDate;
    }
}