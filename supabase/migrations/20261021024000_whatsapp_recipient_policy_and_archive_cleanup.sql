create or replace function public.apply_whatsapp_outbox_policy()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_rule public.whatsapp_notification_rules%rowtype;
  v_key text;
  v_template_body text;
  v_template_enabled boolean;
  v_group_kind text;
  v_group_target text;
  v_group_enabled boolean;
begin
  v_key := nullif(trim(coalesce(new.event_key,'')), '');

  if v_key is null then
    if tg_table_name = 'whatsapp_site_visit_outbox' then
      v_key := 'site.visit';
    elsif tg_table_name = 'whatsapp_client_outbox' then
      if lower(trim(coalesce(new.source,''))) in ('admin','bot','auto-reply','client-reply') then
        v_key := 'client.reply';
      else
        v_key := 'client.project_update';
      end if;
    elsif tg_table_name = 'whatsapp_finance_outbox' then
      if coalesce(new.dedupe_key,'') like 'landview-bill:%' then v_key := 'billing.created';
      elsif coalesce(new.dedupe_key,'') like 'landview-ledger:%' then v_key := 'finance.ledger';
      elsif coalesce(new.dedupe_key,'') like 'project-finance-cheque-cashed:%' then v_key := 'finance.cheque_cashed';
      elsif coalesce(new.dedupe_key,'') like 'project-finance:supplier_delivery:%' then v_key := 'finance.supplier_delivery';
      elsif coalesce(new.dedupe_key,'') like 'project-finance:supplier_advance_fund:%' then v_key := 'finance.supplier_fund';
      elsif coalesce(new.dedupe_key,'') like 'project-contractor-bill-certified:%' then v_key := 'contractor.bill';
      elsif coalesce(new.dedupe_key,'') like 'project-contractor-progress:%' then v_key := 'contractor.progress';
      elsif coalesce(new.message,'') ~* '(^|\n)Expense:' then v_key := 'finance.expense';
      elsif coalesce(new.message,'') ~* '(^|\n)Income:' then v_key := 'finance.income';
      elsif coalesce(new.message,'') ~* 'Client Payment|Received:' then v_key := 'finance.income';
      elsif coalesce(new.message,'') ~* 'Office Expense|Expense \|' then v_key := 'finance.expense';
      else v_key := 'finance.update';
      end if;
    end if;
  end if;

  new.event_key := v_key;
  select * into v_rule
  from public.whatsapp_notification_rules
  where event_key = v_key
  limit 1;

  if found then
    new.priority := coalesce(v_rule.priority,'routine');
    new.recipient_group := v_rule.recipient_group_slug;
    new.template_key := v_rule.template_key;

    if not coalesce(v_rule.enabled,true) then
      new.status := 'suppressed';
      new.last_error := 'Suppressed by WhatsApp notification rule.';
      return new;
    end if;

    if v_rule.recipient_group_slug is not null then
      select destination_kind, target, enabled
        into v_group_kind, v_group_target, v_group_enabled
      from public.whatsapp_recipient_groups
      where slug = v_rule.recipient_group_slug
      limit 1;

      if found then
        if not coalesce(v_group_enabled,true) then
          new.status := 'suppressed';
          new.last_error := 'Suppressed because the WhatsApp recipient group is disabled.';
          return new;
        end if;

        if tg_table_name in ('whatsapp_finance_outbox','whatsapp_site_visit_outbox')
           and v_group_kind = 'group'
           and nullif(trim(coalesce(v_group_target,'')),'') is not null then
          new.group_invite_code := trim(v_group_target);
        end if;
      end if;
    end if;

    if v_rule.template_key is not null then
      select body, enabled
        into v_template_body, v_template_enabled
      from public.whatsapp_templates
      where template_key=v_rule.template_key
      limit 1;

      if coalesce(v_template_enabled,false)
         and position('{{message}}' in coalesce(v_template_body,'')) > 0 then
        new.message := left(replace(v_template_body,'{{message}}',new.message),4000);
      end if;
    end if;
  else
    new.priority := coalesce(nullif(new.priority,''),'routine');
  end if;

  return new;
end;
$function$;

update public.whatsapp_client_outbox
set status='suppressed',
    last_error='Archived at centralized WhatsApp cutover; historical update intentionally not sent.',
    updated_at=now()
where status='failed'
  and last_error='Archived at centralized WhatsApp cutover; historical update intentionally not sent.';
