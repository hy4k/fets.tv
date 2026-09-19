-- Jobs at the centers rotate, so most staff are not a front-office person or a
-- lab person: they are a TCA who does whichever desk the week's duty roster
-- puts them on. The enum value lands on its own because Postgres will not let
-- a new label be used in the transaction that adds it.
alter type public.user_role add value if not exists 'tca';
