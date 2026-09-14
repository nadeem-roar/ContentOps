-- ContentOps :: serialise asset version assignment
--
-- assign_asset_version read max(version) and wrote max + 1 with nothing in between, so
-- two uploads to the same card in the same instant both read the same number and the
-- second lost to the unique (content_item_id, version) constraint. The upload route
-- reports that as "Uploaded to Drive but not recorded" and deliberately leaves the file
-- alone, so the outcome is a creative sitting in Working/ with no row pointing at it.
--
-- A transaction-scoped advisory lock, keyed on the card, makes the read and the write
-- atomic per card. It is taken only on the insert path that actually assigns a version,
-- and released when the transaction ends; uploads to different cards never contend.

create or replace function assign_asset_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    perform pg_advisory_xact_lock(hashtextextended(new.content_item_id::text, 0));

    select coalesce(max(version), 0) + 1 into new.version
    from content_assets
    where content_item_id = new.content_item_id;
  end if;
  return new;
end;
$$;
