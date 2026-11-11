"""Fixed-layer STP calculation and omission rules."""

import unittest

import numpy as np

from ingestion.render import derive_fixed_stp


def grid(values, parameter):
    values = np.asarray(values, dtype=float)
    return {
        "values": values,
        "lats": np.zeros(values.shape),
        "lons": np.zeros(values.shape),
        "sourceHash": parameter.lower().ljust(64, "0")[:64],
        "sourceBytes": 100,
        "record": {"parameter": parameter, "level": "verified test level"},
    }


def ingredients():
    return {
        "cape-surface": [grid([1500], "CAPE")],
        "surface-lcl": [grid([1000], "HGT")],
        "srh-0-1km": [grid([150], "HLCY")],
        "stp-input-vucsh": [grid([12], "VUCSH")],
        "stp-input-vvcsh": [grid([16], "VVCSH")],
        "cin-surface": [grid([-125], "CIN")],
    }


class FixedLayerStpTests(unittest.TestCase):
    def test_matches_hand_computed_value_with_surface_cin_term(self):
        fields = ingredients()

        derive_fixed_stp(fields, np, "hrrr")

        self.assertAlmostEqual(fields["stp-fixed-surface"][0]["values"][0], 0.5)
        self.assertEqual(len(fields["stp-fixed-surface"][0]["sourceInputs"]), 6)

    def test_caps_shear_and_clips_lcl_and_cin_factors(self):
        fields = {
            "cape-surface": [grid([3000, 3000], "CAPE")],
            "surface-lcl": [grid([1500, 2500], "HGT")],
            "srh-0-1km": [grid([300, 300], "HLCY")],
            "stp-input-vucsh": [grid([18, 30], "VUCSH")],
            "stp-input-vvcsh": [grid([24, 40], "VVCSH")],
            "cin-surface": [grid([-50, -500], "CIN")],
        }

        derive_fixed_stp(fields, np, "rrfs")

        np.testing.assert_allclose(fields["stp-fixed-surface"][0]["values"], [3, 0])

    def test_shear_below_12_5_m_per_s_forces_zero_and_cin_is_optional(self):
        fields = ingredients()
        fields.pop("cin-surface")
        fields["stp-input-vucsh"] = [grid([9], "VUCSH")]
        fields["stp-input-vvcsh"] = [grid([0], "VVCSH")]

        derive_fixed_stp(fields, np, "hrrr")

        self.assertEqual(fields["stp-fixed-surface"][0]["values"][0], 0)
        self.assertEqual(len(fields["stp-fixed-surface"][0]["sourceInputs"]), 5)

    def test_missing_any_required_input_omits_the_field(self):
        for field_id in (
            "cape-surface",
            "surface-lcl",
            "srh-0-1km",
            "stp-input-vucsh",
            "stp-input-vvcsh",
        ):
            with self.subTest(field_id=field_id):
                fields = ingredients()
                fields.pop(field_id)

                derive_fixed_stp(fields, np, "hrrr")

                self.assertNotIn("stp-fixed-surface", fields)

    def test_misaligned_inputs_omit_the_field(self):
        fields = ingredients()
        fields["stp-input-vvcsh"] = [grid([16, 17], "VVCSH")]

        derive_fixed_stp(fields, np, "rrfs")

        self.assertNotIn("stp-fixed-surface", fields)

    def test_rap_is_never_approximated(self):
        fields = ingredients()

        derive_fixed_stp(fields, np, "rap")

        self.assertNotIn("stp-fixed-surface", fields)


if __name__ == "__main__":
    unittest.main()
