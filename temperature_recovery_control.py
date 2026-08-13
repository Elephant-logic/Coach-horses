# Compatibility shim for the historic temperature recovery endpoint.
# The v2 controller preserves manager-entered readings during normal reset and
# restores missing records by scanning every available reset archive.
from temperature_recovery_control_v2 import handle
