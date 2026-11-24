"""
rating.py - Performance-Aware ELO Rating System for CampusGhosts Phase 1.

Calculates rating updates based on:
1. Classical logistic match expectations (K=32).
2. Time and memory efficiency metrics clamped within physical system bounds [0, t_max] and [0, m_max].
"""


def calculate_elo_delta(
    player_elo: int,
    opponent_elo: int,
    won: bool,
    time_ms: int,
    memory_kb: int,
    t_max: int = 1000,
    m_max: int = 65536,
) -> int:
    """
    Calculate ELO delta including execution optimization bonuses.

    Mathematical Model:
      - Expected Score: E = 1 / (1 + 10 ** ((opponent_elo - player_elo) / 400))
      - Actual Score  : S = 1.0 if won else 0.0
      - Clamped Time  : clamped_time = max(0, min(time_ms, t_max))
      - Clamped Memory: clamped_memory = max(0, min(memory_kb, m_max))
      - Formula       : round(32 * (S - E) + 10 * (((t_max - clamped_time) / t_max) + ((m_max - clamped_memory) / m_max)))

    Parameters:
      player_elo: Current ELO rating of player
      opponent_elo: Current ELO rating of opponent or target problem
      won: True if player won duel / passed problem, False otherwise
      time_ms: Runtime execution in milliseconds (clamped to [0, t_max])
      memory_kb: Memory consumption in kilobytes (clamped to [0, m_max])
      t_max: Upper threshold for execution runtime in ms (default: 1000)
      m_max: Upper threshold for memory consumption in KB (default: 65536)

    Returns:
      Integer rating change (positive or negative)
    """
    # 1. Expected match outcome (Logistic curve)
    e = 1.0 / (1.0 + (10.0 ** ((float(opponent_elo) - float(player_elo)) / 400.0)))
    s = 1.0 if won else 0.0

    # 2. Strict boundary clamping
    clamped_time = max(0, min(time_ms, t_max))
    clamped_memory = max(0, min(memory_kb, m_max))

    # 3. Efficiency bonuses in range [0.0, 1.0]
    time_ratio = (t_max - clamped_time) / t_max if t_max > 0 else 0.0
    memory_ratio = (m_max - clamped_memory) / m_max if m_max > 0 else 0.0

    # 4. Total delta computation
    delta = round(32.0 * (s - e) + 10.0 * (time_ratio + memory_ratio))
    return int(delta)


def apply_elo_delta(current_elo: int, delta: int, floor: int = 800) -> int:
    """Apply delta with safety floor to avoid unrecoverable elo degradation."""
    return max(floor, current_elo + delta)
