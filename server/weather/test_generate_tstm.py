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

    def test_day_one_window_uses_valid_date_when_provided(self):
        window = generate_tstm.build_effective_window(
            {
                "day": 1,
                "cycleDate": "2026-06-13",
                "validDate": "2026-06-13T18:00:00Z",
            }
        )
        self.assertEqual(window.start, datetime(2026, 6, 13, 18, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_falls_back_to_issue_date(self):
        window = generate_tstm.build_effective_window(
            {
                "day": 1,
                "cycleDate": "2026-06-13",
                "issueDate": "2026-06-13T20:00:00Z",
            }
        )
        self.assertEqual(window.start, datetime(2026, 6, 13, 20, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_falls_back_to_cycle_start_hour(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        # Default issuance time is 06Z when no dates are provided
        self.assertEqual(window.start, datetime(2026, 6, 13, 6, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_href_run_is_previous_spc_cycle(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13", "issuanceTime": "1600"}
        )
        # Start is 16Z; previous SPC cycle is 12Z same day
        self.assertEqual(window.href_run, datetime(2026, 6, 13, 12, tzinfo=timezone.utc))

    def test_day_two_window_is_12z_to_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 2, "cycleDate": "2026-06-13"}
        )
        self.assertEqual(window.start, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 15, 12, tzinfo=timezone.utc))

    def test_day_two_window_href_run_is_cycle_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 2, "cycleDate": "2026-06-13"}
        )
        self.assertEqual(window.href_run, datetime(2026, 6, 13, 12, tzinfo=timezone.utc))

    def test_spc_thunder_periods_are_full_only_in_primary_position(self):
        """The primary period must be "full" (24-hour accumulation)."""
        self.assertEqual(generate_tstm.SPC_THUNDER_PERIODS[0], "full")
        self.assertIn("full", generate_tstm.SPC_THUNDER_PERIODS)

    def test_spc_period_hours_full_returns_two_frames(self):
        hours = generate_tstm.spc_period_hours(24, "full")
        self.assertEqual(hours, [1, 24])

    def test_spc_period_hours_4hr_returns_two_frames(self):
        hours = generate_tstm.spc_period_hours(24, "4hr")
        self.assertEqual(hours, [21, 24])

    def test_spc_period_hours_unknown_returns_single_frame(self):
        hours = generate_tstm.spc_period_hours(24, "unknown")
        self.assertEqual(hours, [24])

    def test_default_thresholds_are_explicit(self):
        """Fixture: core=0.30, support=0.10.  Any change must be intentional."""
        self.assertEqual(
            generate_tstm.DEFAULT_THRESHOLDS,
            {
                "calibratedThunderCoreProbability": 0.30,
                "calibratedThunderSupportProbability": 0.10,
            },
        )

    def test_spc_url_uses_calibrated_thunder_product(self):
        url, filename = generate_tstm.spc_thunder_url(
            datetime(2026, 6, 13, 12, tzinfo=timezone.utc), 24, "full"
        )
        self.assertIn("/thunder/", url)
        self.assertEqual(filename, "spc_post.t12z.hrefct_full.f024.grib2")

    def test_probability_normalization_supports_percent_fields(self):
        normalized = generate_tstm.as_probability(np.array([[0.0, 30.0, 100.0]]))
        np.testing.assert_allclose(normalized, np.array([[0.0, 0.3, 1.0]]))

    def test_probability_normalization_preserves_all_nan_fields(self):
        normalized = generate_tstm.as_probability(np.array([[np.nan, np.nan]]))
        self.assertTrue(np.isnan(normalized).all())

    def test_spc_array_combination_preserves_all_nan_fields(self):
        combined = generate_tstm.combine_spc_arrays(
            [np.array([[np.nan, np.nan]]), np.array([[np.nan, np.nan]])]
        )
        self.assertEqual(combined.shape, (1, 2))
        self.assertTrue(np.isnan(combined).all())

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

    def test_response_thresholds_match_defaults(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        response = generate_tstm.response_payload(window, [], [], {})
        self.assertEqual(response["thresholds"], generate_tstm.DEFAULT_THRESHOLDS)


if __name__ == "__main__":
    unittest.main()
