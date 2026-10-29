from datetime import date

import pandas as pd

from app.analytics.selection import build_records, pick_forecasts
from app.analytics.timeutil import decision_cutoff, expected_periods
from tests.conftest import CUTOFF, LONDON, act_frame, fc_frame, utc


def _pick(f, targets, mode="decision"):
    return pick_forecasts(f, pd.Series(pd.to_datetime(targets, utc=True)), mode, LONDON, CUTOFF, 1)


# Delivery 2026-01-02 12:00Z. Cutoff = 2026-01-01 09:00 London (= 09:00Z in winter).
T = utc(2026, 1, 2, 12)


def test_selects_latest_forecast_published_before_cutoff():
    f = fc_frame([(T, utc(2026, 1, 1, 2, 30), 100), (T, utc(2026, 1, 1, 7, 30), 200),
                  (T, utc(2025, 12, 31, 22, 30), 50)])
    r = _pick(f, [T])
    assert r["forecast_mw"].tolist() == [200]
    assert r["forecast_publish_time"].iloc[0] == utc(2026, 1, 1, 7, 30)


def test_forecast_published_exactly_at_cutoff_is_eligible():
    f = fc_frame([(T, utc(2026, 1, 1, 9, 0), 300), (T, utc(2026, 1, 1, 7, 30), 200)])
    assert _pick(f, [T])["forecast_mw"].tolist() == [300]


def test_rejects_forecasts_published_after_cutoff():
    f = fc_frame([(T, utc(2026, 1, 1, 9, 1), 999), (T, utc(2026, 1, 1, 11, 30), 888),
                  (T, utc(2026, 1, 1, 7, 30), 200)])
    assert _pick(f, [T])["forecast_mw"].tolist() == [200]


def test_no_eligible_forecast_means_no_row_not_fallback_to_late_one():
    f = fc_frame([(T, utc(2026, 1, 1, 9, 30), 999)])
    assert _pick(f, [T]).empty


def test_latest_mode_ignores_cutoff():
    f = fc_frame([(T, utc(2026, 1, 1, 7, 30), 200), (T, utc(2026, 1, 1, 15, 30), 400),
                  (T, utc(2026, 1, 2, 22, 30), 450)])
    assert _pick(f, [T], mode="latest")["forecast_mw"].tolist() == [450]


def test_duplicate_forecast_rows_are_deterministic():
    # Same (start, publish) twice with different values: the last row in input order wins.
    f = fc_frame([(T, utc(2026, 1, 1, 7, 30), 111), (T, utc(2026, 1, 1, 7, 30), 222)])
    assert _pick(f, [T])["forecast_mw"].tolist() == [222]
    assert _pick(f.iloc[::-1], [T])["forecast_mw"].tolist() == [111]  # documented: order-dependent


def test_unsorted_input_gives_same_selection():
    rows = [(T, utc(2026, 1, 1, h, 30), h * 10) for h in (2, 7, 4)]
    assert _pick(fc_frame(rows), [T])["forecast_mw"].tolist() == [70]
    assert _pick(fc_frame(rows[::-1]), [T])["forecast_mw"].tolist() == [70]


def test_cutoff_is_dst_aware():
    # Summer: 09:00 London (BST) is 08:00 UTC. Delivery 2026-07-02 -> cutoff 2026-07-01 08:00Z.
    assert decision_cutoff(date(2026, 7, 2), LONDON, CUTOFF, 1) == utc(2026, 7, 1, 8)
    assert decision_cutoff(date(2026, 1, 2), LONDON, CUTOFF, 1) == utc(2026, 1, 1, 9)
    t = utc(2026, 7, 2, 12)
    f = fc_frame([(t, utc(2026, 7, 1, 8, 30), 999), (t, utc(2026, 7, 1, 7, 30), 200)])
    # 08:30Z is after the 08:00Z cutoff even though it is before "09:00" read as UTC.
    assert _pick(f, [t])["forecast_mw"].tolist() == [200]


def test_delivery_date_uses_london_local_date_in_summer():
    # 2026-07-01T23:30Z is 00:30 BST on 2 July -> belongs to delivery date 2 July.
    t = utc(2026, 7, 1, 23, 30)
    r = build_records(fc_frame([(t, utc(2026, 7, 1, 7, 0), 5)]), act_frame([(t, 4)]),
                      date(2026, 7, 2), date(2026, 7, 2), "decision", LONDON, CUTOFF, 1)
    assert r["start_time"].iloc[0] == utc(2026, 7, 1, 23)  # London midnight = 23:00Z
    row = r[r["start_time"] == t].iloc[0]
    assert row["delivery_date"] == date(2026, 7, 2)
    assert row["cutoff_time"] == utc(2026, 7, 1, 8)
    assert row["forecast_mw"] == 5 and row["error_mw"] == 1


def test_expected_periods_on_dst_days():
    assert len(expected_periods(date(2026, 1, 1), date(2026, 1, 31), LONDON)) == 1488
    assert len(expected_periods(date(2026, 3, 29), date(2026, 3, 29), LONDON)) == 46
    assert len(expected_periods(date(2026, 10, 25), date(2026, 10, 25), LONDON)) == 50


def test_matching_by_delivery_time_and_missing_values_stay_missing():
    t0, t1, t2 = utc(2026, 1, 2, 0), utc(2026, 1, 2, 0, 30), utc(2026, 1, 2, 1)
    f = fc_frame([(t0, utc(2026, 1, 1, 7), 100), (t2, utc(2026, 1, 1, 7), 300)])
    a = act_frame([(t0, 90), (t1, 80)])  # no actual at t2, no forecast at t1
    r = build_records(f, a, date(2026, 1, 2), date(2026, 1, 2), "decision", LONDON, CUTOFF, 1)
    assert len(r) == 48
    by = r.set_index("start_time")
    assert by.loc[t0, "error_mw"] == 10
    assert pd.isna(by.loc[t1, "forecast_mw"]) and pd.isna(by.loc[t1, "error_mw"])
    assert pd.isna(by.loc[t2, "actual_mw"]) and pd.isna(by.loc[t2, "error_mw"])


def test_hold_mode_marks_filled_half_hours():
    t0, t1 = utc(2026, 1, 2, 0), utc(2026, 1, 2, 0, 30)
    f = fc_frame([(t0, utc(2026, 1, 1, 7), 100)])
    a = act_frame([(t0, 90), (t1, 70)])
    r = build_records(f, a, date(2026, 1, 2), date(2026, 1, 2), "decision", LONDON, CUTOFF, 1, "hold")
    by = r.set_index("start_time")
    assert not by.loc[t0, "forecast_filled"] and by.loc[t1, "forecast_filled"]
    assert by.loc[t1, "error_mw"] == 30


def test_empty_inputs_give_all_missing_rows():
    r = build_records(fc_frame([]), act_frame([]), date(2026, 1, 2), date(2026, 1, 2),
                      "decision", LONDON, CUTOFF, 1)
    assert len(r) == 48 and r["forecast_mw"].isna().all() and r["actual_mw"].isna().all()
