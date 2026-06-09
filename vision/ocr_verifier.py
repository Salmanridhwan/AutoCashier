import re
import unicodedata
from collections import defaultdict

import easyocr
import numpy as np
import torch
from PIL import Image
from rapidfuzz import fuzz


MATCH_THRESHOLD = 80.0
MIN_SCORE_MARGIN = 15.0

# These words are useful as supporting evidence, but are too generic to identify a
# product by themselves.
GENERIC_TERMS = {
    "original",
    "rasa",
    "flavor",
    "brand",
    "milk",
    "coklat",
    "chocolate",
    "teh",
    "jeruk",
    "ayam",
    "bawang",
    "cake",
    "cream",
    "double",
}

# Conservative spelling variants for known catalog/package differences.
WORD_VARIANTS = {
    "cappucino": ("cappuccino",),
    "cappuccino": ("cappucino",),
    "coffe": ("coffee",),
    "coffee": ("coffe",),
    "made": ("maid",),
    "maid": ("made",),
}


def normalize_ocr_text(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def _expand_phrase_variants(phrase: str) -> set[str]:
    normalized = normalize_ocr_text(phrase)
    if not normalized:
        return set()

    variants = {normalized}
    words = normalized.split()
    for index, word in enumerate(words):
        for replacement in WORD_VARIANTS.get(word, ()):
            replaced = list(words)
            replaced[index] = replacement
            variants.add(" ".join(replaced))
    return variants


def build_product_keyword_variants(product: dict) -> list[str]:
    """Build searchable phrases from explicit keywords and stable product fields."""
    phrases = []
    for keyword in product.get("ocr_keywords") or []:
        phrases.extend(str(keyword).split("|"))

    phrases.extend(
        [
            product.get("name") or "",
            str(product.get("ai_class_name") or "").replace("_", " "),
        ]
    )

    variants = set()
    for phrase in phrases:
        variants.update(_expand_phrase_variants(phrase))
        for token in normalize_ocr_text(phrase).split():
            if len(token) >= 2:
                variants.update(_expand_phrase_variants(token))

    return sorted(variants, key=lambda value: (-len(value.split()), -len(value), value))


def _variant_score(variant: str, normalized_text: str) -> tuple[float, bool]:
    text_tokens = normalized_text.split()
    variant_tokens = variant.split()
    if not text_tokens or not variant_tokens:
        return 0.0, False

    padded_text = f" {normalized_text} "
    exact = f" {variant} " in padded_text
    if exact:
        return 100.0, True

    # Very short OCR fragments are too collision-prone for fuzzy matching.
    if len(variant_tokens) == 1 and len(variant) <= 3:
        return 0.0, False

    scores = []
    base_size = len(variant_tokens)
    # OCR commonly joins or splits package words, so compare nearby window
    # sizes and their compact forms as well as the normal spaced text.
    window_sizes = {base_size}
    if len(variant.replace(" ", "")) >= 5:
        window_sizes.update({max(1, base_size - 1), base_size + 1})

    compact_variant = variant.replace(" ", "")
    for window_size in sorted(window_sizes):
        if window_size > len(text_tokens):
            continue
        for start in range(len(text_tokens) - window_size + 1):
            candidate = " ".join(text_tokens[start : start + window_size])
            scores.append(float(fuzz.ratio(variant, candidate)))
            scores.append(float(fuzz.ratio(compact_variant, candidate.replace(" ", ""))))
    return max(scores, default=0.0), False


def rank_product_matches(ocr_text: str, products) -> list[dict]:
    """Rank products using unique, normalized keyword evidence."""
    normalized_text = normalize_ocr_text(ocr_text)
    if not normalized_text:
        return []

    prepared = []
    owners = defaultdict(set)
    for product in products:
        variants = build_product_keyword_variants(product)
        product_key = product.get("id") or product.get("ai_class_name") or product.get("name")
        prepared.append((product, variants, product_key))
        for variant in variants:
            owners[variant].add(product_key)

    ranked = []
    for product, variants, _product_key in prepared:
        matches = []
        for variant in variants:
            score, exact = _variant_score(variant, normalized_text)
            if score >= MATCH_THRESHOLD:
                matches.append(
                    {
                        "keyword": variant,
                        "score": score,
                        "exact": exact,
                        "unique": len(owners[variant]) == 1,
                    }
                )

        if not matches:
            continue

        matches.sort(key=lambda item: (-item["score"], -len(item["keyword"])))
        top_scores = [match["score"] for match in matches[:2]]
        score = sum(top_scores) / len(top_scores)

        unique_specific = any(
            match["unique"]
            and (
                (
                    len(match["keyword"].split()) >= 2
                    and match["score"] >= MATCH_THRESHOLD
                    and len(normalized_text.split()) >= len(match["keyword"].split())
                )
                or (
                    len(match["keyword"]) >= 4
                    and match["keyword"] not in GENERIC_TERMS
                    and match["score"] >= 85.0
                )
            )
            for match in matches
        )
        supporting_tokens = {
            match["keyword"]
            for match in matches
            if len(match["keyword"].split()) == 1
            and match["score"] >= MATCH_THRESHOLD
        }
        multiple_supporting = (
            len(supporting_tokens) >= 2
            and any(match["exact"] or match["score"] >= 85.0 for match in matches)
        )
        multiple_exact = len(
            {
                match["keyword"]
                for match in matches
                if match["exact"] and len(match["keyword"].split()) == 1
            }
        ) >= 2

        ranked.append(
            {
                "product": product,
                "score": round(score, 2),
                "strong": unique_specific or multiple_supporting or multiple_exact,
                "matched_keywords": [match["keyword"] for match in matches[:5]],
            }
        )

    # Strong product-specific evidence outranks a higher weak score caused only
    # by a shared brand token.
    return sorted(ranked, key=lambda item: (not item["strong"], -item["score"]))


def match_text_to_products(ocr_text: str, products) -> dict:
    normalized_text = normalize_ocr_text(ocr_text)
    ranked = rank_product_matches(normalized_text, products)
    if not normalized_text:
        return {
            "passed": False,
            "reason": "no_text_detected",
            "ocr_text": "",
            "score": 0.0,
            "second_score": 0.0,
            "score_margin": 0.0,
            "product": None,
            "matched_keywords": [],
        }
    if not ranked:
        return {
            "passed": False,
            "reason": "no_match",
            "ocr_text": normalized_text,
            "score": 0.0,
            "second_score": 0.0,
            "score_margin": 0.0,
            "product": None,
            "matched_keywords": [],
        }

    best = ranked[0]
    # Weak matches caused only by a shared brand (for example "nescafe") must
    # not erase the margin of a strong variant match.
    second_score = next(
        (candidate["score"] for candidate in ranked[1:] if candidate["strong"]),
        0.0,
    )
    margin = best["score"] - second_score
    passed = (
        best["strong"]
        and best["score"] >= MATCH_THRESHOLD
        and margin >= MIN_SCORE_MARGIN
    )

    return {
        "passed": passed,
        "reason": "matched" if passed else "ambiguous_match",
        "ocr_text": normalized_text,
        "score": best["score"],
        "second_score": round(second_score, 2),
        "score_margin": round(margin, 2),
        "product": best["product"] if passed else None,
        "matched_keywords": best["matched_keywords"],
    }


class OCRVerifier:
    def __init__(self):
        use_gpu = torch.cuda.is_available()
        print(f"[OCR] Initializing EasyOCR Reader (languages=['id', 'en'], GPU={use_gpu})...")
        self.reader = easyocr.Reader(["id", "en"], gpu=use_gpu)

    def read_text(self, image_crop: Image.Image) -> str:
        results = self.reader.readtext(np.array(image_crop))
        return normalize_ocr_text(" ".join(result[1] for result in results))

    def match_products(self, image_crop: Image.Image, products) -> dict:
        try:
            return match_text_to_products(self.read_text(image_crop), products)
        except Exception as error:
            print(f"[OCR] EasyOCR processing error: {error}")
            return {
                "passed": False,
                "reason": f"ocr_processing_error: {error}",
                "ocr_text": "",
                "score": 0.0,
                "second_score": 0.0,
                "score_margin": 0.0,
                "product": None,
                "matched_keywords": [],
            }

    def verify_ocr(self, image_crop: Image.Image, keywords: list) -> dict:
        if not keywords:
            return {
                "passed": True,
                "reason": "no_keywords_defined",
                "ocr_text": "",
                "score": 100.0,
            }

        result = self.match_products(
            image_crop,
            [{"id": "target", "name": "", "ai_class_name": "", "ocr_keywords": keywords}],
        )
        return {
            "passed": result["passed"],
            "reason": result["reason"],
            "ocr_text": result["ocr_text"],
            "score": result["score"],
        }
