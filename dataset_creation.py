import random
import pandas as pd

# -----------------------------
# Templates
# -----------------------------

critical_templates = [
    "I am trapped in {}",
    "Help I am stuck in {}",
    "Water level rising I am stuck in {}",
    "I am buried under {}",
    "Can't move stuck in {}",
    "I am surrounded by {} please help",
]

urgent_templates = [
    "Need medical help for {}",
    "{} is injured please send help",
    "Medical emergency at {}",
    "Someone is bleeding at {}",
    "Urgent medical assistance needed in {}",
]

medium_templates = [
    "We need food at {}",
    "No electricity in {}",
    "Need water supply in {}",
    "We are safe but need food at {}",
    "Require basic supplies in {}",
]

low_templates = [
    "Any updates about {}",
    "Where is nearest shelter from {}",
    "Is rescue team coming to {}",
    "Need information about {}",
    "What is happening in {}",
]

locations = [
    "my house", "building", "street", "area", "village",
    "apartment", "road", "zone", "sector", "block"
]

# -----------------------------
# Generate structured samples
# -----------------------------

def generate_samples(templates, label, n):
    data = []
    for _ in range(n):
        temp = random.choice(templates)
        loc = random.choice(locations)
        text = temp.format(loc)
        data.append([text, label])
    return data

data = []
data += generate_samples(critical_templates, "critical", 400)
data += generate_samples(urgent_templates, "urgent", 350)
data += generate_samples(medium_templates, "medium", 350)
data += generate_samples(low_templates, "low", 400)

# -----------------------------
# Add messy real-world samples
# -----------------------------

messy_samples = [
    ("plz help stuck", "critical"),
    ("help me pls water rising", "critical"),
    ("stuck cant move help", "critical"),
    ("im trapped plz help fast", "critical"),
    ("water lvl rising fast", "critical"),
    
    ("need doc urgent", "urgent"),
    ("injured need hlp asap", "urgent"),
    ("bleeding bad need help", "urgent"),
    ("pls send doctor fast", "urgent"),
    ("medical help needed asap", "urgent"),
    
    ("need food asap", "medium"),
    ("no power since 2 days", "medium"),
    ("water needed urgent", "medium"),
    ("food and water req", "medium"),
    ("basic supplies needed", "medium"),
    
    ("any update??", "low"),
    ("where shelter?", "low"),
    ("rescue coming?", "low"),
    ("need info pls", "low"),
    ("whats happening", "low"),
]

data += messy_samples

# -----------------------------
# Shuffle dataset
# -----------------------------

random.shuffle(data)

# -----------------------------
# Save to CSV
# -----------------------------

df = pd.DataFrame(data, columns=["text", "label"])
df.to_csv("disaster_messages.csv", index=False)

print("Dataset created with", len(df), "samples")