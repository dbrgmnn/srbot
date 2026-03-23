from core.srs import sm2


def test_sm2_first_review_perfect():
    """First perfect review should set interval to 1 and increase easiness."""
    # initial state: repetitions=0, easiness=2.5, interval=0
    result = sm2(quality=5, repetitions=0, easiness=2.5, interval=0)

    assert result.repetitions == 1
    assert result.interval == 1
    assert result.easiness == 2.6  # 2.5 + (0.1 - 0)


def test_sm2_second_review_perfect():
    """Second perfect review should set interval to 6."""
    # state after 1st review: repetitions=1, easiness=2.6, interval=1
    result = sm2(quality=5, repetitions=1, easiness=2.6, interval=1)

    assert result.repetitions == 2
    assert result.interval == 6
    assert result.easiness == 2.7


def test_sm2_third_review_perfect():
    """Third perfect review should multiply interval by easiness."""
    # state after 2nd review: repetitions=2, easiness=2.7, interval=6
    result = sm2(quality=5, repetitions=2, easiness=2.7, interval=6)

    assert result.repetitions == 3
    assert result.interval == 16  # round(6 * 2.7) = round(16.2) = 16
    assert result.easiness == 2.8


def test_sm2_failure_resets_progress():
    """Quality < 3 should reset repetitions and interval."""
    # existing word with progress
    result = sm2(quality=2, repetitions=5, easiness=2.5, interval=30)

    assert result.repetitions == 0
    assert result.interval == 1
    # Easiness also drops on failure
    # 2.5 + (0.1 - (5-2)*(0.08 + (5-2)*0.02)) = 2.5 + (0.1 - 3*(0.08 + 0.06)) = 2.5 + (0.1 - 0.42) = 2.5 - 0.32 = 2.18
    assert result.easiness == 2.18


def test_sm2_minimum_easiness():
    """Easiness should never drop below 1.3."""
    # word with very low easiness
    result = sm2(quality=0, repetitions=1, easiness=1.3, interval=1)

    assert result.easiness == 1.3  # 1.3 + negative adjustment, but clamped to 1.3
    assert result.repetitions == 0
    assert result.interval == 1


def test_sm2_hard_review():
    """Quality 3 (Hard) should increase interval but decrease easiness."""
    # repetitions=2, easiness=2.5, interval=6
    result = sm2(quality=3, repetitions=2, easiness=2.5, interval=6)

    assert result.repetitions == 3
    assert result.interval == 15  # round(6 * 2.5) = 15
    # 2.5 + (0.1 - (5-3)*(0.08 + (5-3)*0.02)) = 2.5 + (0.1 - 2*(0.08+0.04)) = 2.5 + (0.1 - 0.24) = 2.36
    assert result.easiness == 2.36
