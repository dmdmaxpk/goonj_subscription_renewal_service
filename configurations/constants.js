
class Constants {
    constructor({}) {
        this.subscription_messages = {
            QDfC: `Free 24hrs Goonj tv trial activate kar dia gya hai. Top channels mobile par dekhny ke liye https://goonj.pk or unsub https://goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfG: `Free 24hrs Goonj tv trial activate kar dia gya hai. Top channels mobile par dekhny ke liye https://goonj.pk or unsub https://goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,                   
            QDfH: `Your Goonj TV subscription for Comedy Portal has been activated at Rs.%price%/day. Thankyou for watching Goonj Comedy`,
            QDfI: `Your Goonj TV subscription for Comedy Portal has been activated at Rs.%price%/week. Thankyou for watching Goonj Comedy`,
            gdn: `Apko Goonj TV activate kr dia gaya ha. Jub chahien Jaib se Mobile nikalien aur TOP LIVE TV Channels deikhen.`
        },
        this.subscription_messages_direct = {
            QDfC: `Goonj Live TV Rs 5/day subscribe kar diya gya hai. Service khatam krnay k liye link par click karein https://goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfG: `Goonj Live TV Rs 15/wk subscribe kar diya gya hai. Service khatam krnay k liye link par click karein https://goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfH: `Goonj Comedy Rs%price% mein subscribe kar di gaye hai. Service dekhne k liye goonj.pk or unsub k liye call 03401832782`,
            QDfI: `Goonj Comedy Rs%price% mein subscribe kar di gaye hai. Service dekhne k liye goonj.pk or unsub k liye call 03401832782`,
        },
        this.message_after_repeated_succes_charge = {
            QDfC: `Goonj tv Rs.5 ap ka mobile balance sa renew kr de gae ha. Daikhny ka lye click goonj.pk or Khatam krny ka lye goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfG: `Goonj tv Rs.15 ap ka mobile balance sa renew kr de gae ha. Daikhny ka lye click goonj.pk or Khatam krny ka lye goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfH: `Ap Pakistan ki best Comedy Portal service istamal kar rahey hain. Service Deikhnay ya Package ki tabdeeli k liay click karein. www.goonj.pk/home`,
            QDfI: `Ap Pakistan ki best Comedy Portal service istamal kar rahey hain. Service Deikhnay ya Package ki tabdeeli k liay click karein. www.goonj.pk/home`
        }
        
        this.message_after_first_successful_charge = {
            QDfC: `Goonj daily Live TV service Rs.5/day istamal krny ka shukria. Service dekhein goonj.pk or Unsub krny ka liya goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,
            QDfG: `Goonj weekly Live TV service Rs.15/week istamal krny ka shukria. Service dekhein goonj.pk or Unsub krny ka liya goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`,                           
            QDfH: `Ap Pakistan ki best Comedy Portal service istamal kar rahey hain. Service Deikhnay ya Package ki tabdeeli k liay click karein. www.goonj.pk/home`,
            QDfI: `Ap Pakistan ki best Comedy Portal service istamal kar rahey hain. Service Deikhnay ya Package ki tabdeeli k liay click karein. www.goonj.pk/home`
        };
        this.message_on_weekly_to_daily_switch = {
            message: `Ap abi Goonj Weekly k subscriber hain. Validity %current_date% khatam hony k bad apka Rs.5+tax/day %next_date% activate ho ga. Khatam krny k liye https://goonj.pk/unsubscribe?proxy=%user_id%&amp;pg=%pkg_id%`
        }
    }

}

module.exports = Constants;