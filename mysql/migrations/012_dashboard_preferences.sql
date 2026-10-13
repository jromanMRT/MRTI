SET @has_show_requisitions = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'user_workspace_preferences'
     AND column_name = 'show_requisitions'
);
SET @add_show_requisitions = IF(
  @has_show_requisitions = 0,
  'ALTER TABLE user_workspace_preferences ADD COLUMN show_requisitions TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE add_show_requisitions FROM @add_show_requisitions;
EXECUTE add_show_requisitions;
DEALLOCATE PREPARE add_show_requisitions;

SET @has_widget_order = (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'user_workspace_preferences'
     AND column_name = 'widget_order'
);
SET @add_widget_order = IF(
  @has_widget_order = 0,
  'ALTER TABLE user_workspace_preferences ADD COLUMN widget_order JSON NULL',
  'SELECT 1'
);
PREPARE add_widget_order FROM @add_widget_order;
EXECUTE add_widget_order;
DEALLOCATE PREPARE add_widget_order;
