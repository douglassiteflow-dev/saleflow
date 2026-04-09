#!/usr/bin/env python3
"""
Scraper för bokadirekt.se - hämtar företagsdata (inga bilder laddas ner).
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "https://www.bokadirekt.se/places/dark-bright-haircouture-47649"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
}


def fetch_page(url: str) -> BeautifulSoup:
    print(f"Hämtar sida: {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def extract_preloaded_state(soup: BeautifulSoup) -> dict | None:
    """Extraherar window.__PRELOADED_STATE__ från script-taggar."""
    for script in soup.find_all("script"):
        if not script.string:
            continue
        match = re.search(r'window\.__PRELOADED_STATE__\s*=\s*({.*?});?\s*$',
                          script.string, re.DOTALL | re.MULTILINE)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    return None


def _find_place_in_preloaded(preloaded: dict) -> dict | None:
    """Hittar place-objektet i preloaded state (djup sökning)."""
    if not preloaded:
        return None
    # Sök rekursivt efter objekt med "instagram" eller "website" nyckel
    def _search(obj):
        if isinstance(obj, dict):
            if "instagram" in obj or "website" in obj:
                return obj
            for v in obj.values():
                result = _search(v)
                if result:
                    return result
        elif isinstance(obj, list):
            for item in obj:
                result = _search(item)
                if result:
                    return result
        return None
    return _search(preloaded)


def extract_services(soup: BeautifulSoup) -> list[dict]:
    """Extraherar tjänster med namn, pris och tid från sidans text.

    Bokadirekt renderar tjänster i formatet:
        Tjänstnamn
        XX - YY min
        Pris
        X XXX kr
        Boka
    """
    services = []
    text = soup.get_text("\n")
    lines = [l.strip() for l in text.split("\n")]

    # Hitta sektionen "Alla tjänster" som startpunkt
    start_idx = None
    for i, line in enumerate(lines):
        if line == "Alla tjänster":
            start_idx = i
            break

    if start_idx is None:
        return services

    # Hitta slutet (t.ex. "Personal" sektionen)
    end_idx = len(lines)
    for i in range(start_idx + 1, len(lines)):
        if lines[i] == "Personal":
            end_idx = i
            break

    current_category = ""
    i = start_idx + 1
    while i < end_idx:
        line = lines[i]

        # Kategorirubriker följs ofta av ett antal (t.ex. "Klippning" följt av "12")
        # Hoppa över tomma rader
        if not line:
            i += 1
            continue

        # Kolla om nästa rad ser ut som en tid (XX min eller XX - YY min)
        if i + 1 < end_idx and re.match(r'^\d+\s*(-\s*\d+)?\s*min$', lines[i + 1]):
            service_name = line
            time_str = lines[i + 1]

            # Extrahera tid
            time_match = re.match(r'^(\d+)\s*(?:-\s*(\d+))?\s*min$', time_str)
            tid_min = time_match.group(1) if time_match else ""
            if time_match and time_match.group(2):
                tid_min = f"{time_match.group(1)}-{time_match.group(2)}"

            # Leta efter pris — skanna framåt tills vi hittar "XX kr" eller nästa tjänst.
            # Bokadirekt kan ha lång beskrivning mellan tid och pris.
            pris = ""
            for j in range(i + 2, min(i + 40, end_idx)):
                ln = lines[j]
                if not ln:
                    continue
                # Stoppa om vi träffar nästa tjänstenamn (dess tid-rad kommer strax efter)
                if j + 1 < end_idx and re.match(r'^\d+\s*(-\s*\d+)?\s*min$', lines[j + 1]):
                    break
                # Stoppa om vi träffar nästa kategori (följd av antal tjänster)
                if j + 1 < end_idx and re.match(r'^\d+$', lines[j + 1]) and not re.match(r'^\d', ln):
                    break
                # Matcha pris-mönster (tillåt "från", en-dash, thousand sep med space/nbsp)
                price_match = re.match(r'^(?:från\s+)?([\d\s\xa0]+(?:[-–][\d\s\xa0]+)?)\s*kr$', ln)
                if price_match:
                    pris = price_match.group(1).replace('\xa0', ' ').strip()
                    break

            services.append({
                "kategori": current_category,
                "namn": service_name,
                "tid_min": tid_min,
                "pris_kr": pris,
            })
            i += 2
            continue

        # Kolla om detta är en kategorirubrik (följd av ett nummer = antal tjänster)
        if i + 1 < end_idx and re.match(r'^\d+$', lines[i + 1]):
            current_category = line
            i += 2
            continue

        i += 1

    return services


def extract_staff(soup: BeautifulSoup) -> list[dict]:
    """Extraherar personal/stylister från sidans text."""
    staff = []
    text = soup.get_text("\n")
    lines = [l.strip() for l in text.split("\n")]

    # Hitta den sista "Personal"-rubriken (den i företagssektionen)
    start_idx = None
    for i, line in enumerate(lines):
        if line == "Personal":
            start_idx = i

    if start_idx is None:
        return staff

    title_keywords = ["stylist", "frisör", "specialist", "makeup", "artist",
                      "barber", "junior", "curl"]
    noise = ["boka", "pris", "kr", "min", "från", "tjänst", "alla"]

    i = start_idx + 1
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue

        if line in ("Omdömen", "Recensioner", "Om oss", "Kontakt", "Hitta hit",
                     "Vanliga frågor", "Avbokningspolicy"):
            break

        is_name = (len(line) < 25 and
                   line[0].isupper() and
                   not any(n in line.lower() for n in noise) and
                   not re.match(r'^\d', line))

        if is_name and i + 1 < len(lines):
            next_line = lines[i + 1]
            if any(t in next_line.lower() for t in title_keywords):
                person = {"namn": line, "titel": next_line}

                desc_lines = []
                j = i + 2
                while j < len(lines):
                    l = lines[j]
                    if not l:
                        j += 1
                        continue
                    if len(l) > 80:
                        desc_lines.append(l)
                        j += 1
                    else:
                        break

                if desc_lines:
                    person["beskrivning"] = " ".join(desc_lines)

                staff.append(person)
                i = j
                continue

        i += 1

    return staff


def parse_opening_hours(soup: BeautifulSoup) -> dict:
    """Extraherar öppettider som strukturerad data."""
    days_sv = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"]
    hours = {}

    text = soup.get_text("\n")
    for day in days_sv:
        pattern = rf'{day}\s*\n?\s*(Stängt|\d{{1,2}}:\d{{2}}\s*-\s*\d{{1,2}}:\d{{2}})'
        match = re.search(pattern, text, re.I)
        if match:
            hours[day.lower()] = match.group(1).strip()

    return hours


def extract_business_info(soup: BeautifulSoup) -> dict:
    """Extraherar all företagsinformation från sidan."""
    info = {}
    preloaded = extract_preloaded_state(soup)

    # Namn
    h1 = soup.find("h1")
    if h1:
        info["namn"] = h1.get_text(strip=True)

    # Meta-beskrivning
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc:
        info["meta_beskrivning"] = meta_desc.get("content", "")

    # OG-data
    for prop in ["og:title", "og:description", "og:image"]:
        tag = soup.find("meta", attrs={"property": prop})
        if tag:
            info[prop.replace("og:", "og_")] = tag.get("content", "")

    # JSON-LD strukturerad data
    json_ld_scripts = soup.find_all("script", type="application/ld+json")
    for script in json_ld_scripts:
        try:
            data = json.loads(script.string)
            if isinstance(data, dict):
                ld_type = data.get("@type", "")
                if ld_type in ("LocalBusiness", "HealthAndBeautyBusiness", "HairSalon", "BeautySalon"):
                    info["adress"] = data.get("address", {})
                    info["telefon"] = data.get("telephone", "")
                    info["epost"] = data.get("email", "")
                    info["betyg"] = data.get("aggregateRating", {})
                    info["geo"] = data.get("geo", {})
                    if "name" in data and "namn" not in info:
                        info["namn"] = data["name"]

                    # Om oss / beskrivning
                    if data.get("description"):
                        info["om_oss"] = data["description"]

                    # Instagram (rensa bort query-parametrar)
                    if data.get("instagram"):
                        info["instagram"] = data["instagram"].split("?")[0]

                    # Recensioner hanteras separat i extract_reviews()
        except (json.JSONDecodeError, TypeError):
            continue

    # Adress från text om inte från JSON-LD
    if "adress" not in info:
        addr_el = soup.find(string=re.compile(r"\d{3}\s?\d{2}\s+\w+"))
        if addr_el:
            info["adress"] = addr_el.strip()

    # Telefon fallback
    if not info.get("telefon"):
        tel_link = soup.find("a", href=re.compile(r"^tel:"))
        if tel_link:
            info["telefon"] = tel_link.get_text(strip=True)

    # E-post fallback
    if not info.get("epost"):
        mail_link = soup.find("a", href=re.compile(r"^mailto:"))
        if mail_link:
            info["epost"] = mail_link.get_text(strip=True)

    # Instagram fallback — kolla preloaded state
    if not info.get("instagram") and preloaded:
        try:
            place = _find_place_in_preloaded(preloaded)
            if place:
                if place.get("instagram"):
                    info["instagram"] = place["instagram"]
                if place.get("website"):
                    info["hemsida"] = place["website"]
        except (KeyError, TypeError):
            pass

    # Öppettider (strukturerad)
    info["öppettider"] = parse_opening_hours(soup)

    # Om oss fallback — sök i sidans text
    if "om_oss" not in info:
        about_section = soup.find(string=re.compile(r"(Om oss|Om salongen|Om företaget|Beskrivning)", re.I))
        if about_section:
            parent = about_section.find_parent()
            if parent:
                sibling = parent.find_next_sibling()
                if sibling:
                    text = sibling.get_text(strip=True)
                    if len(text) > 20:
                        info["om_oss"] = text

    # Betyg fallback
    if "betyg" not in info:
        rating_el = soup.find(attrs={"class": re.compile(r"rating", re.I)})
        if rating_el:
            info["betyg_text"] = rating_el.get_text(strip=True)

    # Personal
    info["personal"] = extract_staff(soup)

    # Tjänster
    info["tjänster"] = extract_services(soup)

    return info


def extract_image_urls(soup: BeautifulSoup) -> list[str]:
    """Extraherar alla unika bild-URL:er från sidan."""
    urls = set()

    # <img> taggar
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if src:
            urls.add(src)
        srcset = img.get("srcset", "")
        for part in srcset.split(","):
            part = part.strip().split(" ")[0]
            if part:
                urls.add(part)

    # OG/meta bilder
    for tag in soup.find_all("meta", attrs={"property": re.compile(r"image")}):
        content = tag.get("content")
        if content:
            urls.add(content)
    for tag in soup.find_all("meta", attrs={"name": re.compile(r"image")}):
        content = tag.get("content")
        if content:
            urls.add(content)

    # Bakgrundsbilder i style-attribut
    for el in soup.find_all(attrs={"style": re.compile(r"url\(")}):
        style = el.get("style", "")
        for match in re.findall(r'url\(["\']?(.*?)["\']?\)', style):
            urls.add(match)

    # CSS bakgrundsbilder i <style> block
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            for match in re.findall(r'url\(["\']?(.*?)["\']?\)', style_tag.string):
                urls.add(match)

    # Filtrera och normalisera
    filtered = []
    for url in urls:
        if not url or url.startswith("data:"):
            continue
        if url.startswith("//"):
            url = "https:" + url
        elif url.startswith("/"):
            url = "https://www.bokadirekt.se" + url
        # Filtrera bort små ikoner och SVG
        if ".svg" in url.lower():
            continue
        if any(skip in url.lower() for skip in ["favicon", "sprite", "icon", "logo-boka"]):
            continue
        filtered.append(url)

    return sorted(set(filtered))


def extract_reviews(soup: BeautifulSoup) -> dict:
    """Extraherar recensioner från preloaded state och JSON-LD.

    Returnerar en dict med sammanfattning och individuella recensioner.
    Preloaded state har rikare data (employee, id) så den prioriteras.
    """
    result = {
        "snittbetyg": None,
        "antal_recensioner": 0,
        "betygsfördelning": {},
        "recensioner": [],
    }

    # 1. Hämta från preloaded state (rikare data)
    preloaded = extract_preloaded_state(soup)
    if preloaded:
        try:
            reviews_data = preloaded["place"]["reviews"]
            result["antal_recensioner"] = reviews_data.get("reviewCount", 0)
            result["betygsfördelning"] = reviews_data.get("reviewCounts", {})

            stats = reviews_data.get("stats", {})
            if stats.get("averageScore"):
                result["snittbetyg"] = stats["averageScore"]

            top = reviews_data.get("topReviews", {})
            for item in top.get("items", []):
                review = {
                    "id": item.get("id"),
                    "namn": item.get("author", {}).get("name", ""),
                    "betyg": item.get("review", {}).get("score", ""),
                    "text": item.get("review", {}).get("text", ""),
                    "datum": item.get("createdAt", ""),
                    "personal": item.get("subject", {}).get("employee", {}).get("name", ""),
                }
                result["recensioner"].append(review)
        except (KeyError, TypeError):
            pass

    # 2. Fyll på med JSON-LD om preloaded inte gav tillräckligt
    if len(result["recensioner"]) < 4:
        seen_names = {r["namn"] for r in result["recensioner"]}
        json_ld_scripts = soup.find_all("script", type="application/ld+json")
        for script in json_ld_scripts:
            try:
                data = json.loads(script.string)
                if not isinstance(data, dict):
                    continue
                ld_type = data.get("@type", "")
                if ld_type not in ("LocalBusiness", "HealthAndBeautyBusiness", "HairSalon", "BeautySalon"):
                    continue

                if not result["snittbetyg"]:
                    agg = data.get("aggregateRating", {})
                    if agg.get("ratingValue"):
                        result["snittbetyg"] = agg["ratingValue"]
                    if agg.get("reviewCount"):
                        result["antal_recensioner"] = agg["reviewCount"]

                for r in data.get("review", []):
                    author = r.get("author", {}).get("name", "")
                    if author in seen_names:
                        continue
                    review = {
                        "namn": author,
                        "betyg": r.get("reviewRating", {}).get("ratingValue", ""),
                        "text": r.get("reviewBody", ""),
                        "datum": r.get("datePublished", ""),
                    }
                    result["recensioner"].append(review)
                    seen_names.add(author)
            except (json.JSONDecodeError, TypeError):
                continue

    return result



def quick_scrape(url: str):
    """Snabbskrapning — bara grundinfo (namn, telefon, epost), ingen bildnedladdning."""
    soup = fetch_page(url)
    info = extract_business_info(soup)
    result = {
        "namn": info.get("namn", ""),
        "telefon": info.get("telefon", ""),
        "epost": info.get("epost", ""),
    }
    print(json.dumps(result, ensure_ascii=False))


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else URL
    quick = "--quick" in sys.argv

    if quick:
        quick_scrape(url)
        return

    # Skapa output-mapp baserad på företagsnamnet i URL:en
    slug = url.rstrip("/").split("/")[-1]
    # Respect GENFLOW_OUTPUT_DIR env var (set by Electron in packaged mode)
    base_output = os.environ.get("GENFLOW_OUTPUT_DIR", str(Path(__file__).parent.parent / "output"))
    output_dir = Path(base_output) / slug
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  Bokadirekt Scraper")
    print(f"{'='*60}\n")

    # Hämta och parsa sidan
    soup = fetch_page(url)

    # Extrahera företagsinfo
    print("\nExtraherar företagsinfo...")
    info = extract_business_info(soup)
    info["url"] = url

    # Extrahera bild-URL:er
    print("Extraherar bild-URL:er...")
    image_urls = extract_image_urls(soup)
    info["antal_bilder"] = len(image_urls)
    print(f"  Hittade {len(image_urls)} bilder")

    # Extrahera recensioner
    print("Extraherar recensioner...")
    reviews = extract_reviews(soup)
    print(f"  {len(reviews['recensioner'])} recensioner (av {reviews['antal_recensioner']} totalt, snitt {reviews['snittbetyg']}★)")

    # Spara företagsdata som JSON
    json_path = output_dir / "företagsdata.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    print(f"\nFöretagsdata sparad: {json_path}")

    # Spara recensioner som separat JSON
    reviews_path = output_dir / "recensioner.json"
    with open(reviews_path, "w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)
    print(f"Recensioner sparade: {reviews_path}")

    # Bilder laddas INTE ner — vi använder Unsplash stock i stället
    if "--no-images" not in sys.argv:
        print(f"\n{len(image_urls)} bilder hittades (laddas inte ner)")

    print(f"\n{'='*60}")
    print(f"  Klart! Output: {output_dir}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
