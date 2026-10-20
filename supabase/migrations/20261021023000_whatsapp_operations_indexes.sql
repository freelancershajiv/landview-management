create index if not exists whatsapp_notification_rules_recipient_group_idx
  on public.whatsapp_notification_rules(recipient_group_slug);

create index if not exists whatsapp_notification_rules_template_idx
  on public.whatsapp_notification_rules(template_key);
