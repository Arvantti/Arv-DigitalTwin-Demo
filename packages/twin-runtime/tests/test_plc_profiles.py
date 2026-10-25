import pytest
from twin_runtime.plc_profiles import HourlyProfile, progressive_profile


def test_hourly_profile_interpolates_and_wraps_at_midnight() -> None:
    profile = HourlyProfile.from_values([float(hour * 10) for hour in range(24)], maximum=300)
    assert profile.at_hour(2.5) == 25.0
    assert profile.at_hour(23.5) == 115.0
    assert profile.at_hour(24.5) == 5.0


def test_hourly_profile_rejects_wrong_length_and_out_of_range_values() -> None:
    with pytest.raises(ValueError, match="24 valores"):
        HourlyProfile.from_values([1.0])
    with pytest.raises(ValueError, match="entre 0 y 100"):
        HourlyProfile.from_values([101.0] * 24)


def test_progressive_profile_reaches_the_peak_and_returns_to_the_minimum() -> None:
    profile = progressive_profile(30, 100, 12)
    assert profile.at_hour(0) == 30
    assert profile.at_hour(12) == 100
    assert profile.at_hour(24) == 30
    assert profile.at_hour(6) == 65
    assert len(profile.samples()) == 97
