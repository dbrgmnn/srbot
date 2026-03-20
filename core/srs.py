from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class ReviewResult:
    next_review: datetime
    interval: int
    easiness: float
    repetitions: int


def sm2(
    quality: int,     # 0-2 = fail, 3 = hard, 4 = good, 5 = perfect
    repetitions: int,
    easiness: float,
    interval: int,    # Days
) -> ReviewResult:
    """Implementation of the SM-2 Spaced Repetition Algorithm."""
    if quality < 3:
        # Failure: reset learning progress
        repetitions = 0
        interval = 1
    else:
        # Success: advance interval
        repetitions += 1
        if repetitions == 1:
            interval = 1
        elif repetitions == 2:
            interval = 6
        else:
            interval = round(interval * easiness)

    # Update easiness factor (min 1.3 to prevent intervals from collapsing)
    easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    easiness = max(1.3, easiness)

    now = datetime.now(tz=timezone.utc)
    delta = timedelta(days=interval)
    next_review = now + delta

    return ReviewResult(
        next_review=next_review,
        interval=interval,
        easiness=round(easiness, 2),
        repetitions=repetitions,
    )
