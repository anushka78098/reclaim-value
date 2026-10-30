"""SYNTHETIC trades for smoke-testing train_price.py ONLY. A model trained on this just re-learns the baseline formula."""
import random, pandas as pd
from recommend import BASE_PRICE, COND_MULT
random.seed(1); rows = []
for _ in range(2000):
    m = random.choice(list(BASE_PRICE)); c = random.choice("ABCD"); d = random.random()
    rows.append(dict(material=m, condition=c, quantity=random.randint(50, 5000), demand=d, distance=random.uniform(1, 60),
                     unit_price=BASE_PRICE[m] * COND_MULT[c] * (0.8 + 0.4 * d) * random.uniform(0.85, 1.15)))
pd.DataFrame(rows).to_csv("synthetic_trades.csv", index=False)
