import unittest

from ocr_verifier import (
    build_product_keyword_variants,
    match_text_to_products,
    normalize_ocr_text,
)


PRODUCTS = [
    {
        "id": "capp",
        "name": "Nescafe Cappucino",
        "ai_class_name": "nescafe_cappucino",
        "ocr_keywords": ["nescafe", "cappucino"],
    },
    {
        "id": "coffee",
        "name": "Nescafe Coffe Cream",
        "ai_class_name": "nescafe_coffe_cream",
        "ocr_keywords": ["nescafe", "coffe", "cream"],
    },
    {
        "id": "oreo",
        "name": "Oreo Original",
        "ai_class_name": "oreo_original",
        "ocr_keywords": ["oreo", "original"],
    },
    {
        "id": "good-time",
        "name": "Good Time Double Choc",
        "ai_class_name": "good_time_double_choc",
        "ocr_keywords": ["good", "time", "double", "choc"],
    },
    {
        "id": "nu",
        "name": "Nu Teh Tarik",
        "ai_class_name": "nu_teh_tarik",
        "ocr_keywords": ["nu", "teh", "tarik"],
    },
    {
        "id": "sosro",
        "name": "Teh Sosro Kotak",
        "ai_class_name": "teh_sosro_kotak",
        "ocr_keywords": ["teh", "sosro", "kotak"],
    },
    {
        "id": "bear",
        "name": "Bear Brand",
        "ai_class_name": "bear_brand",
        "ocr_keywords": ["bear", "brand"],
    },
]


class OCRVerifierTests(unittest.TestCase):
    def test_normalizes_punctuation_and_spacing(self):
        self.assertEqual(normalize_ocr_text("  Nescafe!\nCAPPUCCINO  "), "nescafe cappuccino")

    def test_builds_known_spelling_variants(self):
        variants = build_product_keyword_variants(PRODUCTS[0])
        self.assertIn("cappuccino", variants)
        self.assertIn("nescafe cappuccino", variants)

    def test_distinguishes_similar_nescafe_products(self):
        result = match_text_to_products("NESCAFE CAPPUCCINO", PRODUCTS)
        self.assertTrue(result["passed"])
        self.assertEqual(result["product"]["id"], "capp")

    def test_shared_brand_alone_is_ambiguous(self):
        result = match_text_to_products("NESCAFE", PRODUCTS)
        self.assertFalse(result["passed"])
        self.assertEqual(result["reason"], "ambiguous_match")

    def test_generic_word_alone_does_not_identify_product(self):
        result = match_text_to_products("ORIGINAL", PRODUCTS)
        self.assertFalse(result["passed"])

    def test_two_distinctive_words_can_verify_partial_package_text(self):
        result = match_text_to_products("GOOD TIME", PRODUCTS)
        self.assertTrue(result["passed"])
        self.assertEqual(result["product"]["id"], "good-time")

    def test_shared_generic_word_does_not_choose_tea_product(self):
        result = match_text_to_products("TEH", PRODUCTS)
        self.assertFalse(result["passed"])

    def test_handles_ocr_split_inside_product_variant(self):
        result = match_text_to_products("NESCAFE CAPPU CCNO", PRODUCTS)
        self.assertTrue(result["passed"])
        self.assertEqual(result["product"]["id"], "capp")

    def test_uses_two_supporting_noisy_keywords(self):
        result = match_text_to_products("COFFO CREAM", PRODUCTS)
        self.assertTrue(result["passed"])
        self.assertEqual(result["product"]["id"], "coffee")

    def test_accepts_noisy_unique_multiword_brand(self):
        result = match_text_to_products("BLAR BRAN", PRODUCTS)
        self.assertTrue(result["passed"])
        self.assertEqual(result["product"]["id"], "bear")

    def test_single_weak_fuzzy_word_is_not_enough(self):
        products = [
            {
                "id": "prima",
                "name": "Prima",
                "ai_class_name": "prima",
                "ocr_keywords": ["prima"],
            }
        ]
        result = match_text_to_products("PRIMO", products)
        self.assertFalse(result["passed"])


if __name__ == "__main__":
    unittest.main()
