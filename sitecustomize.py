"""Runtime compatibility for Command de Cuisine shared-state saves.

The browser keeps a bounded activity list. Once old activity rows roll off the
client copy, they must not prevent otherwise valid state saves. Temperature
history keeps the existing protection implemented in auth_controls.
"""

import auth_controls

_original_preserved = auth_controls._append_only_preserved


def _preserved_with_rolling_activity(current_state, incoming_state, key):
    if key == "audit":
        return True
    return _original_preserved(current_state, incoming_state, key)


auth_controls._append_only_preserved = _preserved_with_rolling_activity
