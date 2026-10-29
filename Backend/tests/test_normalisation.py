from app.services.normalisation import normalise_actuals, normalise_forecasts
from tests.conftest import raw_actual, raw_forecast


def test_forecast_duplicates_and_invalid_rows_counted():
    rows = [
        raw_forecast("2026-01-02T00:00:00Z", "2026-01-01T07:30:00Z", 100),
        raw_forecast("2026-01-02T00:00:00Z", "2026-01-01T07:30:00Z", 101),  # duplicate key
        raw_forecast("2026-01-02T01:00:00Z", "2026-01-01T07:30:00Z", None),  # null generation
        raw_forecast("not-a-date", "2026-01-01T07:30:00Z", 5),               # bad timestamp
        raw_forecast("2026-01-02T02:00:00Z", "2026-01-01T07:30:00Z", -3),    # negative
    ]
    df, q = normalise_forecasts(rows)
    assert len(df) == 1 and df["generation"].iloc[0] == 101
    assert q == {"raw_rows": 5, "invalid_rows_dropped": 3, "duplicates_dropped": 1}
    assert str(df["start_time"].dt.tz) == "UTC"


def test_actuals_filter_fuel_dedupe_keep_latest_publish():
    rows = [
        raw_actual("2026-01-02T00:00:00Z", 10, publish="2026-01-02T00:30:00Z"),
        raw_actual("2026-01-02T00:00:00Z", 12, publish="2026-01-02T03:00:00Z"),  # revised
        raw_actual("2026-01-02T00:00:00Z", 9999, fuel="NUCLEAR"),
        raw_actual("2026-01-02T00:30:00Z", None),
    ]
    df, q = normalise_actuals(rows)
    assert df["generation"].tolist() == [12]
    assert q["invalid_rows_dropped"] == 1 and q["duplicates_dropped"] == 1


def test_empty_rows():
    for fn in (normalise_forecasts, normalise_actuals):
        df, q = fn([])
        assert df.empty and q["raw_rows"] == 0
