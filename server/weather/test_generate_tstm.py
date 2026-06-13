"""Pure tests for the preserved Auto-TSTM GRIB2 generator."""

from datetime import datetime, timezone
import unittest

import numpy as np

import generate_tstm


class GenerateTstmTests(unittest.TestCase):
    def test_day_one_window_ends_at_upcoming_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13", "issuanceTime": "0600"}
        )
        self.assertEqual(window.start, datetime(2026, 6, 13, 6, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))
        self.assertTrue(window.forecast_hours)

    def test_day_two_window_is_12z_to_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 2, "cycleDate": "2026-06-13"}
        )
        self.assertEqual(window.start, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 15, 12, tzinfo=timezone.utc))

    def test_spc_url_uses_calibrated_thunder_product(self):
        url, filename = generate_tstm.spc_thunder_url(
            datetime(2026, 6, 13, 12, tzinfo=timezone.utc), 24, "full"
        )
        self.assertIn("/thunder/", url)
        self.assertEqual(filename, "spc_post.t12z.hrefct_full.f024.grib2")

    def test_probability_normalization_supports_percent_fields(self):
        normalized = generate_tstm.as_probability(np.array([[0.0, 30.0, 100.0]]))
        np.testing.assert_allclose(normalized, np.array([[0.0, 0.3, 1.0]]))

    def test_response_shape_preserves_source_metadata(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        response = generate_tstm.response_payload(
            window,
            [],
            ["not ready"],
            {"calibratedThunder": {"product": "spc_hrefct_full"}},
        )
        self.assertEqual(response["features"], [])
        self.assertEqual(response["warnings"], ["not ready"])
        self.assertEqual(
            response["sources"]["calibratedThunder"]["product"],
            "spc_hrefct_full",
        )


if __name__ == "__main__":
    unittest.main()
