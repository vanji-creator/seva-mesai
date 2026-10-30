# Eval results – sale deed extraction

Field accuracy = share of 7 fields correct. Decision accuracy = the officer would see the same suggestion and the same findings as with the correct values.

| Variant | Pipeline | Field acc | Decision acc | Latency | ₹ / doc | Errors |
|---|---|---|---|---|---|---|
| typed_values | none | 100% | 100% | 0.0 s | 0 | 0 |
| pdf_typed | extract | 100% | 100% | 5.8 s | 1 | 0 |
| pdf_typed | extract_translit | 100% | 100% | 5.8 s | 1.04 | 0 |
| pdf_typed | extract_phonetic | 100% | 100% | 5.8 s | 1.04 | 0 |
| pdf_typed | parse_llm | 100% | 100% | 4.1 s | 0.52 | 0 |
| pdf_typed | parse_regex | 93% | 100% | 3.1 s | 0.5 | 0 |
| scan_clean | extract | 100% | 100% | 5.8 s | 1 | 0 |
| scan_clean | extract_translit | 100% | 100% | 5.8 s | 1.04 | 0 |
| scan_clean | extract_phonetic | 100% | 100% | 5.8 s | 1.04 | 0 |
| scan_clean | parse_llm | 100% | 100% | 3.8 s | 0.52 | 0 |
| scan_clean | parse_regex | 93% | 100% | 3.1 s | 0.5 | 0 |
| phone_photo | extract | 100% | 100% | 5.8 s | 1 | 0 |
| phone_photo | extract_translit | 100% | 100% | 5.8 s | 1.04 | 0 |
| phone_photo | extract_phonetic | 100% | 100% | 5.8 s | 1.04 | 0 |
| phone_photo | parse_llm | 100% | 100% | 3.9 s | 0.52 | 0 |
| phone_photo | parse_regex | 93% | 100% | 3.1 s | 0.5 | 0 |
| handwritten_form | extract | 100% | 100% | 6.4 s | 1 | 0 |
| handwritten_form | extract_translit | 100% | 100% | 6.4 s | 1.04 | 0 |
| handwritten_form | extract_phonetic | 100% | 100% | 6.4 s | 1.04 | 0 |
| handwritten_form | parse_llm | 100% | 100% | 3.8 s | 0.52 | 0 |
| handwritten_form | parse_regex | 100% | 100% | 3.0 s | 0.5 | 0 |
| photocopy | extract | 100% | 100% | 6.0 s | 1 | 0 |
| photocopy | extract_translit | 100% | 100% | 6.0 s | 1.04 | 0 |
| photocopy | extract_phonetic | 100% | 100% | 6.0 s | 1.04 | 0 |
| photocopy | parse_llm | 100% | 100% | 4.0 s | 0.52 | 0 |
| photocopy | parse_regex | 93% | 100% | 3.2 s | 0.5 | 0 |
| english_names | extract | 71% | 0% | 5.8 s | 1 | 0 |
| english_names | extract_translit | 96% | 25% | 5.8 s | 1.04 | 0 |
| english_names | extract_phonetic | 96% | 50% | 5.8 s | 1.04 | 0 |
| english_names | parse_llm | 71% | 0% | 3.9 s | 0.52 | 0 |
| english_names | parse_regex | 64% | 0% | 3.2 s | 0.5 | 0 |
| stamp_paper | extract | 100% | 100% | 5.7 s | 1 | 0 |
| stamp_paper | extract_translit | 100% | 100% | 5.7 s | 1.04 | 0 |
| stamp_paper | extract_phonetic | 100% | 100% | 5.7 s | 1.04 | 0 |
| stamp_paper | parse_llm | 100% | 100% | 3.9 s | 0.52 | 0 |
| stamp_paper | parse_regex | 93% | 100% | 3.1 s | 0.5 | 0 |

## Classify gate

| File | Expected | Got | Confidence | ✓ |
|---|---|---|---|---|
| PT-2026-0101/pdf_typed | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/scan_clean | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/phone_photo | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/handwritten_form | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/photocopy | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/english_names | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0101/stamp_paper | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/pdf_typed | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/scan_clean | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/phone_photo | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/handwritten_form | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/photocopy | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/english_names | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0103/stamp_paper | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/pdf_typed | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/scan_clean | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/phone_photo | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/handwritten_form | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/photocopy | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/english_names | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0104/stamp_paper | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/pdf_typed | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/scan_clean | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/phone_photo | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/handwritten_form | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/photocopy | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/english_names | sale_deed | sale_deed | 1 | ✓ |
| PT-2026-0107/stamp_paper | sale_deed | sale_deed | 1 | ✓ |
| wrong_ration_card | ration_card | ration_card | 1 | ✓ |
| wrong_tax_receipt | tax_receipt | tax_receipt | 1 | ✓ |
