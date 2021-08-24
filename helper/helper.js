class Helper {

    static setDateWithTimezone(date){
        let newDate = date.toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        newDate = new Date(newDate);
        return newDate;
    }

    static float2Int(float) {
        return float | 0;
    }
}

module.exports = Helper;