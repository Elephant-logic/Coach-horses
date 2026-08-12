# Legacy history recovery

The original single-file app stored standalone/offline state under `cdc_state_v1` and queued failed server saves under `cdc_dirty_v1`.

The History screen now offers a manager-only **Recover old history** action. It previews any state still present under those keys and merges only operational history records that do not already exist. Current users, settings, stock levels, recipes and menus are not replaced. Rows tagged `startup-baseline` are ignored.

Recovery preserves original measurements and record content. Records without an existing source are marked `legacy-device`; every imported row is annotated with `recoveredFrom` and `recoveredAt`.
