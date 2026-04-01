from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class ReviewResult:
    next_review: datetime
    interval: int
    easiness: float
    repetitions: int


def sm2(
    quality: int,
    repetitions: int,
    easiness: float,
    interval: int,
) -> ReviewResult:
    """Implement the SM-2 Spaced Repetition Algorithm."""
    if quality < 3:
        repetitions = 0
        interval = 1
    else:
        repetitions += 1
        if repetitions == 1:
            interval = 1
        elif repetitions == 2:
            interval = 6
        else:
            interval = round(interval * easiness)

    # Update easiness factor (minimum 1.3)
    easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    easiness = max(1.3, easiness)

    now = datetime.now(tz=UTC)
    next_review = now + timedelta(days=interval)

    return ReviewResult(
        next_review=next_review,
        interval=interval,
        easiness=round(easiness, 2),
        repetitions=repetitions,
    )
