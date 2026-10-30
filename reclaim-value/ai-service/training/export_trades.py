"""Export real completed trades from MongoDB to the CSV used by ../train_price.py.
python export_trades.py mongodb://127.0.0.1:27017/reclaim_value trades.csv"""
import sys, math, datetime as dt, pandas as pd
from pymongo import MongoClient
db = MongoClient(sys.argv[1]).get_default_database()
def hav(a, b):
    R = 6371; p1, p2 = math.radians(a[1]), math.radians(b[1]); dl = math.radians(b[0] - a[0]); dp = p2 - p1
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))
rows = []
for t in db.transactions.find():
    rq = db.purchaserequests.find_one({"_id": t["requestId"]}); l = db.listings.find_one({"_id": rq["listingId"]}); m = db.materials.find_one({"_id": l["materialId"]})
    s, b = db.users.find_one({"_id": t["sellerId"]}), db.users.find_one({"_id": t["buyerId"]})
    since = t["timestamp"] - dt.timedelta(days=30)
    demand = min(1.0, db.purchaserequests.count_documents({"createdAt": {"$gte": since, "$lte": t["timestamp"]}, "listingId": {"$in": [x["_id"] for x in db.listings.find({"materialId": {"$in": [y["_id"] for y in db.materials.find({"materialType": m["materialType"]})]}})]}}) / 20)
    rows.append(dict(material=m["materialType"], condition=m["conditionScore"], quantity=rq["quantity"], demand=demand,
                     distance=hav(s["location"]["coordinates"], b["location"]["coordinates"]), unit_price=t["finalPrice"] / max(rq["quantity"], 1)))
pd.DataFrame(rows).to_csv(sys.argv[2], index=False); print(len(rows), "trades exported")
