"""Phrase templates for the synthetic demo dataset.

Each aspect has positive / negative / neutral phrase templates with {slots}.
Some phrases deliberately avoid the seed keywords in config/markets/*.json so the
embedding layer of aspect detection has something to find (realistic recall test).
Everything here is fictional: competitor names are invented.
"""

ITEMS = [
    "milk", "bread", "eggs", "curd", "paneer", "atta", "rice", "dal", "onions", "tomatoes", "potatoes",
    "bananas", "apples", "coriander", "chips", "cold drinks", "ice cream", "chocolates", "biscuits", "butter",
    "cheese", "detergent", "shampoo", "toothpaste", "diapers", "coffee", "tea", "maggi", "vegetables", "fruits",
    "oil", "sugar", "namkeen", "juice", "yogurt", "frozen peas", "batteries", "dishwash liquid",
]
MINS = ["7", "8", "9", "10", "11", "12", "13", "15"]
LATE = ["40 minutes", "45 mins", "an hour", "over an hour", "50 minutes", "1.5 hours", "35 min"]
AMOUNTS = ["₹49", "₹89", "₹120", "₹150", "₹230", "₹340", "₹499", "₹780", "₹1,200", "Rs 300", "Rs. 650"]
DAYS = ["2 days", "3 days", "5 days", "a week", "10 days", "two weeks", "4 days"]
MONTHS = ["2", "3", "6", "8", "10", "12", "18"]

PHRASES: dict[str, dict[str, list[str]]] = {
    "delivery_speed": {
        "positive": [
            "delivery was super fast",
            "got my order in {mins} minutes",
            "delivered within {mins} mins, impressive",
            "lightning fast delivery as always",
            "the rider reached before the ETA",
            "delivery is quick even at night",
            "{item} reached my door in under {mins} minutes",
            "fast delivery every single time",
            "my groceries showed up before I finished making tea",
            "always on time",
            "really quick delivery during rain also",
            "order arrived in {mins} min flat",
            "never had to wait long for an order",
            "speed of delivery is unmatched",
        ],
        "negative": [
            "delivery was late by {late}",
            "they promise {mins} minutes but it took {late}",
            "order got delayed again",
            "slow delivery, waited {late} for {item}",
            "the rider kept roaming around and came after {late}",
            "ETA keeps increasing after placing the order",
            "it is no longer quick, takes forever",
            "late delivery is now a daily thing",
            "waited {late} for a simple order of {item}",
            "the so called {mins} minute delivery is a joke",
            "my order sat at the store for ages before anyone picked it up",
            "delivery time is very bad in my area",
        ],
        "neutral": [
            "delivery took around 20 minutes",
            "delivery time is ok, not super fast",
            "order came in about half an hour",
            "delivery speed depends on the time of day",
        ],
    },
    "pricing": {
        "positive": [
            "prices are cheaper than my local kirana",
            "very affordable prices",
            "good value for money",
            "prices are reasonable compared to MRP",
            "{item} was cheaper than the supermarket",
            "no hidden charges, prices are fair",
            "low delivery fee compared to others",
            "budget friendly for daily essentials",
            "I actually save money ordering here",
            "fair pricing on fruits and vegetables",
        ],
        "negative": [
            "prices are too high",
            "everything is overpriced",
            "{item} costs more than MRP here",
            "the delivery fee and handling charge add up to {amt}",
            "new platform fee on every order, very costly",
            "small cart fee is a scam",
            "prices increased suddenly",
            "surge charges even when it is not raining",
            "very expensive compared to the local shop",
            "same {item} is {amt} cheaper outside",
            "they keep adding new fees at checkout",
            "my bill was way more than I expected",
        ],
        "neutral": [
            "prices are similar to other apps",
            "pricing is average",
            "some items are cheap and some are costly",
        ],
    },
    "discounts_offers": {
        "positive": [
            "great discounts on daily items",
            "the offers are really good",
            "got {amt} cashback on my first order",
            "coupons actually work here",
            "membership gives free delivery, worth it",
            "lots of deals on {item}",
            "weekend sale was amazing",
            "promo codes saved me a lot",
            "buy one get one offers on {item} are nice",
            "the pass pays for itself in a week",
        ],
        "negative": [
            "offers are fake",
            "coupon code never works",
            "cashback was not credited",
            "discounts have reduced a lot",
            "the membership is useless now",
            "promo applied but discount not given",
            "shows an offer and then removes it at checkout",
            "no good deals anymore",
            "free delivery offer is misleading",
        ],
        "neutral": [
            "offers are ok",
            "there are some coupons but nothing special",
            "discounts are similar to other apps",
        ],
    },
    "product_availability": {
        "positive": [
            "everything is always available",
            "huge variety of products",
            "they have items I can't find anywhere else",
            "wide range of brands",
            "rarely see anything out of stock",
            "found even imported {item}",
            "great selection of fruits and vegetables",
            "they stock everything from {item} to {item2}",
            "one app for all my monthly shopping",
            "availability is excellent even late at night",
            "never had to go to the market since I started using it",
        ],
        "negative": [
            "half the items are out of stock",
            "{item} is always unavailable",
            "very limited options",
            "basic things like {item} are not available",
            "most products show sold out",
            "the store near me has nothing in stock",
            "every time I search for {item} it says coming soon",
            "had to order from another app because nothing was there",
            "poor product range",
            "could not find {item} or {item2}",
        ],
        "neutral": [
            "most items are available",
            "availability is ok",
            "sometimes {item} is not there but mostly fine",
        ],
    },
    "product_quality": {
        "positive": [
            "vegetables are very fresh",
            "quality of {item} is excellent",
            "fruits were fresh and well packed",
            "good quality products",
            "never received anything expired",
            "{item} was fresh and well within expiry",
            "packaging was neat and nothing was damaged",
            "the meat and dairy are always fresh",
            "quality is better than the local market",
        ],
        "negative": [
            "received rotten {item}",
            "the bread was stale",
            "got expired {item}",
            "{item} packet was leaking",
            "vegetables were not fresh at all",
            "quality has gone down badly",
            "eggs were broken",
            "{item} smelled bad",
            "found fungus on the {item}",
            "items came crushed and damaged",
            "the {item} was already past the expiry date",
        ],
        "neutral": [
            "quality is ok",
            "quality is like any other store",
            "{item} was fine, nothing special",
        ],
    },
    "order_accuracy": {
        "positive": [
            "everything was correct in my order",
            "never got a wrong item",
            "they always send exactly what I ordered",
            "order was complete and accurate",
            "all items were there, nothing missing",
            "correct items every time",
        ],
        "negative": [
            "received the wrong item",
            "{item} was missing from my order",
            "items missing in almost every order",
            "they sent {item} instead of {item2}",
            "wrong quantity delivered",
            "half the order was missing",
            "got a different brand than what I ordered",
            "my bag had someone else's things",
            "paid for {item} but it never came in the bag",
            "they replaced {item} with something else without asking",
        ],
        "neutral": [
            "one item was swapped but it was similar",
            "order was mostly correct",
        ],
    },
    "customer_support": {
        "positive": [
            "customer support resolved my issue quickly",
            "the support executive was very polite",
            "chat support is helpful",
            "customer care responded in minutes",
            "support team sorted it out immediately",
            "the agent understood my problem and fixed it",
        ],
        "negative": [
            "customer support is useless",
            "no response from customer care",
            "chat support just gives copy paste replies",
            "the bot keeps looping and never connects to a human",
            "support executive disconnected the chat",
            "raised a complaint {days} ago and still no reply",
            "customer service is pathetic",
            "nobody helps, they just say sorry for the inconvenience",
            "impossible to reach a real person",
            "support closed my ticket without solving anything",
            "they told me to wait 48 hours and then ignored me",
            "talking to them is a waste of time",
        ],
        "neutral": [
            "support replied after some time",
            "customer care is average",
            "the chat support exists but is slow",
        ],
    },
    "refunds_returns": {
        "positive": [
            "refund was instant",
            "got my money back within minutes",
            "easy returns and quick refund",
            "they refunded the damaged item without questions",
            "replacement was sent the same day",
            "refund credited to the original payment method quickly",
            "returning {item} was hassle free",
        ],
        "negative": [
            "refund not received yet",
            "still waiting for my refund of {amt}",
            "refund took {days}",
            "they refused to refund for the damaged {item}",
            "refund is pending for {days}",
            "no refund, no replacement, nothing",
            "they said the refund was processed but I never got the money",
            "return request got rejected for no reason",
            "my {amt} is stuck and nobody tells me when I will get it back",
            "refund went to their wallet instead of my bank",
            "had to follow up five times to get my money back",
        ],
        "neutral": [
            "refund came after a couple of days",
            "refund process is standard",
        ],
    },
    "app_experience": {
        "positive": [
            "the app is very easy to use",
            "clean and simple interface",
            "app is smooth and fast",
            "user friendly app",
            "search works really well",
            "checkout takes just a few taps",
            "love the new design",
            "tracking screen is very clear",
            "navigation is simple even for my parents",
        ],
        "negative": [
            "app keeps crashing",
            "the latest update ruined the app",
            "app crashes at checkout",
            "too many bugs after the update",
            "app is slow and laggy",
            "login OTP never comes",
            "the screen freezes when I add items",
            "app hangs every time I open the cart",
            "cart gets emptied randomly",
            "the new update is full of glitches",
            "can't even place an order, the app just shows loading",
            "app logs me out again and again",
            "the new version is terrible",
        ],
        "neutral": [
            "app is ok",
            "the interface is fine",
            "app works, nothing special",
        ],
    },
    "payments": {
        "positive": [
            "payment is smooth with UPI",
            "lots of payment options",
            "cash on delivery is available which is great",
            "checkout payment is quick and safe",
            "never had a payment issue",
        ],
        "negative": [
            "payment failed but money got deducted",
            "charged twice for the same order",
            "UPI payment keeps failing",
            "{amt} debited but order not placed",
            "cash on delivery option removed",
            "card payment never goes through",
            "payment stuck on processing for ages",
        ],
        "neutral": [
            "payment works fine mostly",
            "payment options are standard",
        ],
    },
}

# Complaint themes that do NOT belong to any fixed aspect category. Topic discovery
# (pipeline step 8) should surface these as "Uncategorised themes". Keys start with "other:"
# so evaluation ignores them for per-aspect scores.
OTHER_THEMES = {
    "other:rider_behaviour": [
        "the delivery guy was very rude",
        "rider asked me for extra money as tip",
        "delivery boy refused to come to my floor and asked me to come down",
        "the rider was rude on the phone and shouted at me",
        "delivery partner threw the bag at the gate",
        "rider called ten times and then misbehaved",
        "the delivery person was rude and impatient",
    ],
    "other:serviceability": [
        "not serviceable in my area anymore",
        "they stopped service at my pincode",
        "says not delivering to your location right now",
        "my area is still not covered",
        "service unavailable in my locality most evenings",
    ],
    "other:packaging_waste": [
        "way too much plastic packaging for small orders",
        "every item comes in a separate plastic bag, so wasteful",
        "huge carton for one small packet, the packaging waste is crazy",
        "please reduce the plastic, too many bags",
    ],
}

GENERIC = {
    "positive": [
        "good app", "Nice", "very good service", "Excellent!", "best app for groceries", "love it", "superb",
        "Awesome experience", "happy with the service", "5 star", "convenient and reliable", "great app",
        "very helpful app", "life saver", "Amazing", "good", "very nice app", "Best in the market",
        "highly recommended", "my go-to app for everything",
    ],
    "negative": [
        "worst app", "very bad", "Pathetic service", "fraud app", "never again", "useless", "disappointed",
        "terrible experience", "waste of time", "not recommended", "worst experience ever", "bad",
        "uninstalling", "they have become so bad", "horrible", "worst service",
    ],
    "neutral": [
        "ok", "average", "it's fine", "decent", "okay okay", "could be better", "good but can improve",
        "not bad", "fine", "average app",
    ],
}

OPENERS = [
    "I have been using {brand} for {months} months now.",
    "Ordered {item} and {item2} last night.",
    "Used {brand} today.",
    "I order almost every day for my family.",
    "This is my third order this week.",
    "Tried {brand} after a friend suggested it.",
    "Ordered for my parents' house.",
    "Regular customer here.",
    "Placed an order around 11pm.",
    "Switched from another app recently.",
    "Writing this after many orders.",
    "Used to be my favourite app.",
]
CLOSERS_POS = [
    "Keep it up!", "Will order again.", "Recommended.", "Thank you {brand}.", "Great job team.",
    "Very satisfied.", "Overall a great experience.", "5 stars from me.",
]
CLOSERS_NEG = [
    "Will not order again.", "Very disappointed.", "Please fix this.", "Uninstalling.",
    "Moving to another app.", "Fix it asap.", "Totally unacceptable.", "Do better {brand}.",
]
CLOSERS_NEU = ["Overall ok.", "Hope they improve.", "Let's see.", "It is what it is."]

EMOJI = {
    "positive": ["👍", "😊", "🔥", "❤️", "🙌", "👌", "😍", "⭐⭐⭐⭐⭐"],
    "negative": ["😡", "👎", "😤", "🤬", "😞", "💔", "🙄"],
    "neutral": ["🙂", "😐", "🤷"],
}

CONTRAST = [" but ", " but ", ", but ", ". However, ", ", though ", "; ", " although "]
SAME = [" and ", ". ", ", ", ". Also ", " & ", ". "]

# Romanised Hindi (Hinglish) and Devanagari reviews — stored and counted, not analysed (see CLAUDE.md §6.3).
HINGLISH = {
    "delivery_speed": {
        "positive": ["delivery bahut fast thi", "{mins} minute mein order aa gaya", "delivery ekdum time pe hui"],
        "negative": ["delivery bahut late aayi", "{late} wait karna pada", "order abhi tak nahi aaya"],
    },
    "pricing": {
        "positive": ["daam bahut sahi hai", "market se sasta hai"],
        "negative": ["bahut mehenga hai", "har order pe extra charge lagate hai"],
    },
    "product_quality": {
        "positive": ["sabzi ekdum fresh thi", "quality bahut acchi hai"],
        "negative": ["{item} kharab nikla", "sabzi sadi hui thi"],
    },
    "refunds_returns": {
        "positive": ["refund turant mil gaya"],
        "negative": ["paisa wapas nahi mila abhi tak", "refund ka koi jawab nahi"],
    },
    "customer_support": {
        "positive": ["customer care ne madad ki"],
        "negative": ["customer care koi help nahi karta", "support wale sirf sorry bolte hai"],
    },
    "app_experience": {
        "positive": ["app chalane mein aasan hai"],
        "negative": ["app baar baar band ho jata hai", "naya update bekar hai"],
    },
}
HINGLISH_GENERIC = {
    "positive": ["bahut accha app hai bhai", "mast service hai", "ekdum badhiya", "sabse best app"],
    "negative": ["bekar app hai", "bilkul bakwas service", "kabhi mat use karna", "faltu app"],
    "neutral": ["theek thaak hai", "chalta hai"],
}
DEVANAGARI = {
    "positive": ["बहुत अच्छा ऐप है", "डिलीवरी बहुत जल्दी हुई", "सामान ताज़ा था, धन्यवाद"],
    "negative": ["बहुत खराब सर्विस", "रिफंड अभी तक नहीं मिला", "डिलीवरी बहुत देर से आई"],
    "neutral": ["ठीक है", "ठीक ठाक सर्विस है"],
}
DEVANAGARI_ASPECT = {
    "बहुत खराब सर्विस": [],
    "रिफंड अभी तक नहीं मिला": [("refunds_returns", "negative")],
    "डिलीवरी बहुत देर से आई": [("delivery_speed", "negative")],
    "डिलीवरी बहुत जल्दी हुई": [("delivery_speed", "positive")],
    "सामान ताज़ा था, धन्यवाद": [("product_quality", "positive")],
}

SPAM = [
    "Earn ₹5000 daily from home!! Visit bit.ly/{code} now",
    "Use my referral code {code} to get free cash on signup",
    "Call 98{digits} for instant personal loan approval",
    "Join my telegram channel t.me/{code} for free recharge",
    "good good good good good good good good good good",
    "nice nice nice nice nice nice nice nice nice",
    "WIN FREE IPHONE click www.{code}.xyz",
]

CHAT_SPEAK = {"you": "u", "are": "r", "please": "pls", "very": "v", "really": "rly", "because": "coz", "okay": "ok"}
