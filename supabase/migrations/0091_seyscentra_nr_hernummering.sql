-- Migratie 0091: SeysCentra vragen.nr hernummeren naar schone, doorlopende reeks per module
-- ---------------------------------------------------------------------------------------
-- Op Kees' expliciete verzoek (na migratie 0090): geen NUM-voorvoegsel en geen module-
-- vreemde historische labels meer zichtbaar. Elke module krijgt gewoon <code>-1, <code>-2, ...
-- in de bestaande weergave-volgorde (module.volgorde, dan vraag.volgorde, dan nr) -- de
-- SeysCentra-eigen vragen komen dus voor de Numodo-aanvulling te staan, zoals nu al het
-- geval is. ALLEEN nr en volgorde veranderen; vraag/antwoord/bevinding/klasse/pva/
-- locatie_id/functiegroep_id/module_id blijven letterlijk ongewijzigd (geverifieerd via
-- een hash op vraag-id, die nr/volgorde bewust niet meetelt). Alleen SeysCentra geraakt,
-- geen schemawijziging.

begin;

do $$
declare
  v_company_id uuid := 'bd16538b-01e9-41d2-84ad-fe5690917cba';
  v_aantal_voor int;
  v_aantal_na int;
  v_hash_voor text;
  v_hash_na text;
begin
  select count(*) into v_aantal_voor from public.vragen where company_id = v_company_id;
  if v_aantal_voor <> 168 then
    raise exception 'Onverwacht aantal vragen vooraf: % (verwacht 168) -- afgebroken.', v_aantal_voor;
  end if;

  -- Hash op vraag-id (nr/volgorde bewust NIET meegeteld) -- moet na de migratie identiek zijn.
  select md5(string_agg(v.id::text||'|'||v.module_id::text||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,'')||'|'||coalesce(v.locatie_id::text,'')||'|'||coalesce(v.functiegroep_id::text,'')||'|'||coalesce(v.klasse,''), '~' order by v.id))
    into v_hash_voor
    from public.vragen v where v.company_id = v_company_id;

  -- Stap 1: elke nr eerst tijdelijk op een gegarandeerd unieke waarde zetten (het eigen
  -- id), zodat de UNIEKE (company_id, nr) -constraint niet in de weg zit bij de omwisseling
  -- hieronder (sommige nieuwe nr's bestaan al als oude nr elders in dezelfde module).
  update public.vragen set nr = 'TMP-' || id::text
  where company_id = v_company_id;

  -- Stap 2: definitieve nr + volgorde per vraag-id.
  with plan(id, nieuwe_nr, nieuwe_volgorde) as (
    values
    ('1f4a4b75-44bd-4928-9754-de988cfd2cff'::uuid, 'F1-1', 1),
    ('000e773f-01ae-4ecf-8885-aab91ee85762'::uuid, 'F1-2', 2),
    ('815805df-b956-49f5-b270-0350742d85c6'::uuid, 'F1-3', 3),
    ('d5108a79-b94b-43ee-875b-43011336c0e4'::uuid, 'F1-4', 4),
    ('109fafc8-404e-4d4d-a7e5-c410a4159d67'::uuid, 'F1-5', 5),
    ('2e7b6aeb-2c2a-40c1-bd8c-7dcfd325f934'::uuid, 'F1-6', 6),
    ('d676bef3-c7d0-4424-a78d-0198b9d821b7'::uuid, 'F1-7', 7),
    ('088af8df-2a8d-464c-95da-b64a6340907d'::uuid, 'F1-8', 8),
    ('fd2e1a5f-adb7-4b56-a124-36e6470f6a2f'::uuid, 'F1-9', 9),
    ('49dbe747-f3e8-4933-b3aa-271f07c2c4fe'::uuid, 'F1-10', 10),
    ('14527829-40bd-4eba-ae90-131b6378fb82'::uuid, 'F1-11', 11),
    ('ce8935eb-91e1-4c99-878b-8ade5899c451'::uuid, 'F1-12', 12),
    ('563e686e-6e86-4be5-927d-70174a526e60'::uuid, 'F1-13', 13),
    ('4eddae5a-c053-4226-b1d0-799bceb9fc16'::uuid, 'F1-14', 14),
    ('c948ee22-fa1a-4061-88db-5ad9bce1d04f'::uuid, 'F1-15', 15),
    ('32f1b459-6a5c-490b-8047-1bb05e9368b8'::uuid, 'F1-16', 16),
    ('a0614ce5-3f58-4c32-9a3e-b6091e1bf2c4'::uuid, 'F1-17', 17),
    ('f22ce47f-12f3-4c04-9cf1-b80fa3b2b964'::uuid, 'F1-18', 18),
    ('95628706-9db8-4513-a8a2-55b54cd73b81'::uuid, 'F1-19', 19),
    ('44087888-d966-427b-8f28-320bc6c7e770'::uuid, 'F1-20', 20),
    ('0637eabe-a82e-4f9b-a438-44781d2289e9'::uuid, 'F1-21', 21),
    ('e1007cec-b52d-43c4-bdfb-6542129433f5'::uuid, 'F1-22', 22),
    ('719cfd33-4c48-4548-ac85-e32d51f9260c'::uuid, 'F1-23', 23),
    ('d07dd4ad-7502-45c3-a09a-098ff9e31b9d'::uuid, 'F1-24', 24),
    ('8cc59d3f-f2a5-421c-8cc7-eb0f102f9ebb'::uuid, 'F1-25', 25),
    ('8dc9ee04-1dd5-43a1-8ee6-f95112249b24'::uuid, 'F2-1', 1),
    ('4ca4354e-8d30-4a79-b30e-f7fb20157bd3'::uuid, 'F2-2', 2),
    ('8c6c9a99-bc65-452f-a35a-96542d3d9b7b'::uuid, 'F2-3', 3),
    ('4a500a74-8c87-4b70-ba4b-50f83b79d376'::uuid, 'F2-4', 4),
    ('65d54724-730a-4f3b-b409-9762b3489833'::uuid, 'F2-5', 5),
    ('f1c1d158-ed13-4455-aa10-a242460a8412'::uuid, 'F2-6', 6),
    ('5517a24f-c68f-4d62-a86b-b28398b524e6'::uuid, 'F2-7', 7),
    ('4f27253e-2151-4920-83c3-ce96928a7771'::uuid, 'F2-8', 8),
    ('fee05d46-5955-4a51-b7e1-186357dbfe8f'::uuid, 'F2-9', 9),
    ('8a3dcf1f-d396-4675-9cde-598ba41d22a3'::uuid, 'F2-10', 10),
    ('4dac0e3a-3f76-476e-be20-2cd80085ba23'::uuid, 'F2-11', 11),
    ('e01b2e8e-5539-4c5f-a5f5-c8419531ea7b'::uuid, 'F2-12', 12),
    ('e0dd5ef2-2ad9-47a3-ada8-5c8a3b07f335'::uuid, 'F2-13', 13),
    ('4c49bb30-10a1-48c7-9ad5-3ac77b58fbbd'::uuid, 'F2-14', 14),
    ('2a4e7c2b-abe2-4270-b5e2-6d4a1a6afc9e'::uuid, 'F2-15', 15),
    ('9b9bbcd8-757a-4228-8e7c-9bc89cfc7336'::uuid, 'F2-16', 16),
    ('aa6d129b-c450-4148-be68-6c675ef9ce13'::uuid, 'F3-1', 1),
    ('18c40db2-709d-4e09-b3a5-a7819d2efe5e'::uuid, 'F3-2', 2),
    ('3202ec1e-12d9-48e6-9f68-86a66b9cf791'::uuid, 'F3-3', 3),
    ('95cd8b37-0721-441a-bd9c-a2062a3d8a6a'::uuid, 'F3-4', 4),
    ('cdcd5460-af29-401e-a5ff-dd73b9e1fbbd'::uuid, 'F3-5', 5),
    ('e2b30d45-5720-497e-965f-f529ef4a747a'::uuid, 'F3-6', 6),
    ('7afae14c-58d4-4fa7-b547-d390fb9c8742'::uuid, 'F3-7', 7),
    ('e3af8fc6-6e87-4da2-bfd1-84ca7d6d413e'::uuid, 'F3-8', 8),
    ('270bf538-0d47-4c1d-b6ea-12ec3079462b'::uuid, 'F3-9', 9),
    ('c28dfa8f-6785-42d9-b34d-66d484c45447'::uuid, 'F3-10', 10),
    ('4a269dbc-a350-4b45-91d4-e25c550edc20'::uuid, 'F3-11', 11),
    ('e882fd12-a486-4f39-83d2-d4c5150c9e08'::uuid, 'F3-12', 12),
    ('a0576ee6-5bd4-465c-be5b-e2dc7bf23f92'::uuid, 'F3-13', 13),
    ('6e9c888d-5019-44da-8bb6-00415159ab2e'::uuid, 'F3-14', 14),
    ('ae54d737-7cdf-4b7f-9ebe-c2562394a67c'::uuid, 'F3-15', 15),
    ('1ccf7e81-fa46-4e9c-9b21-93a7fee9222c'::uuid, 'F3-16', 16),
    ('8db4b890-fc11-4aa4-8094-c2502e4af56a'::uuid, 'F3-17', 17),
    ('ac5bac37-188d-4123-ab75-72a163499531'::uuid, 'F3-18', 18),
    ('9886a671-f134-41ce-9383-b507339ed5ef'::uuid, 'F3-19', 19),
    ('993bc578-38d4-46ef-a3b6-2e622b3e0874'::uuid, 'L1-1', 1),
    ('5f56edbd-273d-40cb-b0a4-a220478cab79'::uuid, 'L1-2', 2),
    ('69c1f44c-0cfb-4d7c-91f8-879b910b61b2'::uuid, 'L1-3', 3),
    ('e3446c34-f171-44f3-a939-b12bab8adacb'::uuid, 'L1-4', 4),
    ('fad28db0-7209-4b4f-a3e6-4e21ab7befdf'::uuid, 'L1-5', 5),
    ('7935652e-307a-4ddd-a1e8-35a1382d2895'::uuid, 'L1-6', 6),
    ('6e900e5b-e1e5-424f-acf7-75902345e0a6'::uuid, 'L1-7', 7),
    ('00eed173-4d9c-449a-9acd-20de796ccfd6'::uuid, 'L1-8', 8),
    ('fad1d366-3b23-47c0-a90a-4d422f23e056'::uuid, 'L1-9', 9),
    ('d335d014-f762-43d2-b669-357a0d3f4618'::uuid, 'L1-10', 10),
    ('32a096ac-233c-4365-8262-7a54f05dedcb'::uuid, 'L1-11', 11),
    ('5d617f24-388b-4f60-8966-ae3dc489d213'::uuid, 'L1-12', 12),
    ('fac02e48-3b7b-4dea-9391-effe1b78e0fe'::uuid, 'L1-13', 13),
    ('f650ec8b-c914-47de-8586-bdf32b489cf7'::uuid, 'L1-14', 14),
    ('4609c946-cd22-44b6-b017-3026348fa5e0'::uuid, 'L1-15', 15),
    ('520a985b-96f5-4844-9a47-b3c9029fec9a'::uuid, 'L1-16', 16),
    ('c703f10b-d4ef-4e88-9120-90f1350a35d5'::uuid, 'L1-17', 17),
    ('90bf7e7d-e201-415e-98dc-4c001aadf855'::uuid, 'L1-18', 18),
    ('1ab29739-a1eb-4d2c-8825-4c408bd9af6b'::uuid, 'L1-19', 19),
    ('4a8f3d5f-49c8-4c6e-9a3a-7ac3d28381a4'::uuid, 'L1-20', 20),
    ('3a80f607-dddd-4d47-9559-7a12b9e4f0bc'::uuid, 'L1-21', 21),
    ('c661d04c-b8d7-4317-bf10-e5ce67c6f64d'::uuid, 'L1-22', 22),
    ('e540b2f3-2347-40cc-b262-9d7bcbcfb745'::uuid, 'L1-23', 23),
    ('31a9b029-f39a-41db-8a11-306607763d20'::uuid, 'L1-24', 24),
    ('cb5c2b70-6c04-46fb-9a0f-fcd14ad5ea7b'::uuid, 'L1-25', 25),
    ('b5bb8215-dbd2-450a-81db-14357e35d697'::uuid, 'L1-26', 26),
    ('59a7ea60-7f00-40f2-a33e-9be37674da82'::uuid, 'L1-27', 27),
    ('fd165085-8aa0-42a9-9fec-66ae6297080b'::uuid, 'L1-28', 28),
    ('49030a8a-a25b-488a-b4ca-b45b19b2895d'::uuid, 'L1-29', 29),
    ('c5592245-2e93-4ab3-949f-08d2a57760de'::uuid, 'L1-30', 30),
    ('5bb7effb-6144-4401-84c7-fb4fa356e08d'::uuid, 'L1-31', 31),
    ('a79d78f9-c7a4-4e7a-9196-1f8ca4e803a2'::uuid, 'L1-32', 32),
    ('3c03e575-ef1f-4d00-b675-3ee976111e91'::uuid, 'L1-33', 33),
    ('d6ba1b6a-e487-4874-bb23-bb7f0d77897c'::uuid, 'L1-34', 34),
    ('bcd44f72-f80c-4f1b-afa7-36f081fe95c4'::uuid, 'L2-1', 1),
    ('1a534a82-9286-4b9c-b68d-9f3f90fff293'::uuid, 'L2-2', 2),
    ('3cdebaaf-c880-4a7a-b681-1525492f8bd3'::uuid, 'L2-3', 3),
    ('ce57fcba-bade-494d-a066-96f15a93ea7b'::uuid, 'L2-4', 4),
    ('e6a088ff-2d33-4eed-8091-bc2975c912fc'::uuid, 'L2-5', 5),
    ('f4578a93-3016-44d8-9375-233b6f441c6c'::uuid, 'L2-6', 6),
    ('be6ed61a-5eac-4286-bfe7-c5282b8dd4d6'::uuid, 'L2-7', 7),
    ('b3806a5d-40a9-4f60-a43b-eca28f0abb7c'::uuid, 'L2-8', 8),
    ('24928fd5-d2d5-45a3-8356-d22ce48024a1'::uuid, 'L2-9', 9),
    ('cc81a270-78e3-4124-9d23-db63f9509ddd'::uuid, 'L2-10', 10),
    ('54f3f49e-e1ef-41d8-9581-581bb5bb2819'::uuid, 'L2-11', 11),
    ('14aad90f-9a9a-400d-8f9c-86dd9ca05af3'::uuid, 'L3-1', 1),
    ('831dd34b-8c35-4bfd-abb4-f0e7b9f2c31a'::uuid, 'L3-2', 2),
    ('c6643a09-47fd-4c35-858b-8e633282f8a4'::uuid, 'L3-3', 3),
    ('92326dd6-1b5c-4494-bf30-b612d2b9a84f'::uuid, 'L3-4', 4),
    ('c6e36713-15c3-4e5b-971f-c7bb8625664b'::uuid, 'L3-5', 5),
    ('d99ef0b0-ec85-42b6-ba3a-6a8a3f51590e'::uuid, 'L3-6', 6),
    ('fe4727b9-d59d-4b43-8639-3923fd46e380'::uuid, 'L3-7', 7),
    ('92129d54-b42d-4eeb-9bf5-aa5c3dc59137'::uuid, 'L3-8', 8),
    ('27c3e098-7bb3-4e33-956e-6cf96179ed0c'::uuid, 'L3-9', 9),
    ('819621c3-1203-4938-9929-7264ee5f046e'::uuid, 'L3-10', 10),
    ('87b0adaf-9931-4dee-9046-366fd848b5b5'::uuid, 'O1-1', 1),
    ('8df7513c-0f96-4ebb-93f2-40d5bcb974c7'::uuid, 'O1-2', 2),
    ('8c7ffa4c-bdad-40f4-818f-1ef9d744436e'::uuid, 'O1-3', 3),
    ('a9067cfb-ba61-4139-9d0f-a05c9071a46d'::uuid, 'O1-4', 4),
    ('64fac6e5-d432-4faa-9499-7164da7ff95e'::uuid, 'O1-5', 5),
    ('0d0b14ac-afa1-4cee-adf0-919003c5c4db'::uuid, 'O1-6', 6),
    ('6cf1a0fc-7db0-474b-bc8a-2abfbcfde842'::uuid, 'O1-7', 7),
    ('4531423c-536d-41cb-9343-c686202d8065'::uuid, 'O1-8', 8),
    ('fab347a5-9b99-461f-b9a2-dbd93e315f35'::uuid, 'O1-9', 9),
    ('a900076d-3766-4542-918d-041afb552550'::uuid, 'O1-10', 10),
    ('ac5fa436-d0ab-4811-9b1c-744b4152925c'::uuid, 'O1-11', 11),
    ('aa298d2e-db48-47b8-8409-4ec4ef91bd70'::uuid, 'O1-12', 12),
    ('6772cce3-db28-4dce-b422-7bed680b33cd'::uuid, 'O2-1', 1),
    ('267d61bb-1dcc-48e9-b959-8a1440922ca0'::uuid, 'O2-2', 2),
    ('a69ae7f9-755c-4bb4-be99-3646caaaad43'::uuid, 'O2-3', 3),
    ('46f814e0-af11-4093-8d52-a67351ac48a6'::uuid, 'O2-4', 4),
    ('2d45e044-ef18-4a7f-8829-a24eedb3f474'::uuid, 'O2-5', 5),
    ('5d64d691-bf32-4417-a9b7-e83ecf107748'::uuid, 'O2-6', 6),
    ('1dd65e49-13c1-49b5-9bce-6fab2ec95fd1'::uuid, 'O2-7', 7),
    ('ecfb4209-e59c-4ed2-8616-b761220e3a41'::uuid, 'O2-8', 8),
    ('b74e2506-db50-43c8-96ef-f4bf7bd01c48'::uuid, 'O2-9', 9),
    ('36d99bab-40ce-4564-800a-d374fd8ac90d'::uuid, 'O2-10', 10),
    ('971dadc4-d2dc-4462-90af-751d424ef85b'::uuid, 'O3-1', 1),
    ('621b9cfb-1233-41d0-a69a-8b6097824b5a'::uuid, 'O3-2', 2),
    ('723219c2-ee7b-4232-b5ba-bfaeb94e7b15'::uuid, 'O3-3', 3),
    ('b1dd6ead-ed7f-4352-8dad-d5c44486a55b'::uuid, 'O3-4', 4),
    ('3476c616-48b4-4542-9fb2-deb7e5459ec7'::uuid, 'O3-5', 5),
    ('5e4aef7a-37fd-45eb-9e45-0df8859b56e9'::uuid, 'O3-6', 6),
    ('6c2a2e8e-a2c9-43ac-9e97-9c3e880e6d91'::uuid, 'O3-7', 7),
    ('5f4d2ee0-99ec-4ece-977c-ed1c82be6c1d'::uuid, 'O3-8', 8),
    ('00d0a75e-6736-4384-bc43-85285c3b2da8'::uuid, 'P1-1', 1),
    ('a751b0f5-461b-45ec-af8b-f3fdf40f7146'::uuid, 'P1-2', 2),
    ('8d41d401-c747-4fc3-a423-fa38539a7002'::uuid, 'P1-3', 3),
    ('b18b9ebc-ce8c-4b7a-85d2-6d3b6a713586'::uuid, 'P1-4', 4),
    ('e098c804-9e05-4999-889d-d6f4f869af5b'::uuid, 'P1-5', 5),
    ('3d5f3965-083b-41c7-a2a9-a60c138ab566'::uuid, 'P1-6', 6),
    ('666bcf2a-a5ce-4008-b878-5fbbf0c131c7'::uuid, 'P1-7', 7),
    ('6a4b11d9-4b58-4b94-8c4a-c45093a00c3d'::uuid, 'P1-8', 8),
    ('96ce7774-2715-4e7a-8ae8-46327c48cd10'::uuid, 'P1-9', 9),
    ('b8ff5e92-036f-4ff6-8052-288034473c5f'::uuid, 'P1-10', 10),
    ('a86c77bc-9baf-435f-abfa-5896f79f9503'::uuid, 'P1-11', 11),
    ('7dd74cbf-d57f-4dc2-a686-6bcd9779d101'::uuid, 'P1-12', 12),
    ('34c26990-c0d6-4082-9961-9c9ce30bca30'::uuid, 'P1-13', 13),
    ('82964ded-bde4-4b0c-b1b8-2f664637bf83'::uuid, 'P2-1', 1),
    ('f1c9e60a-14f5-46fa-b94f-43f88414bb82'::uuid, 'P2-2', 2),
    ('65560858-185b-44e1-89a6-d2eabd02e1b2'::uuid, 'P2-3', 3),
    ('4fe2b0f7-95a2-43f9-a2af-f22b6d1da6da'::uuid, 'P2-4', 4),
    ('364c288a-2938-4324-aa7e-a87f3a8fa60f'::uuid, 'P2-5', 5),
    ('74015fbd-9ec9-487f-a4ec-af421308a840'::uuid, 'P2-6', 6),
    ('3b9ab957-5713-49ea-87a3-11762d58a1fb'::uuid, 'P2-7', 7),
    ('8169cc87-84ea-4853-821e-6573b6f2d02f'::uuid, 'P3-1', 1),
    ('63dccf69-321e-471b-bba2-6d78fec0fca8'::uuid, 'P3-2', 2),
    ('7d57435b-541a-4132-ab15-520e5e463f03'::uuid, 'P3-3', 3)
  )
  update public.vragen v set nr = p.nieuwe_nr, volgorde = p.nieuwe_volgorde
  from plan p
  where v.id = p.id and v.company_id = v_company_id;

  if exists (select 1 from public.vragen where company_id = v_company_id and nr like 'TMP-%') then
    raise exception 'Er staat nog minstens 1 vraag op een tijdelijke nr -- afgebroken.';
  end if;

  select count(*) into v_aantal_na from public.vragen where company_id = v_company_id;
  select md5(string_agg(v.id::text||'|'||v.module_id::text||'|'||coalesce(v.vraag,'')||'|'||coalesce(v.antwoord,'')||'|'||coalesce(v.bevinding,'')||'|'||coalesce(v.pva,'')||'|'||coalesce(v.locatie_id::text,'')||'|'||coalesce(v.functiegroep_id::text,'')||'|'||coalesce(v.klasse,''), '~' order by v.id))
    into v_hash_na
    from public.vragen v where v.company_id = v_company_id;

  if v_hash_na is distinct from v_hash_voor then
    raise exception 'Inhoud (los van nr/volgorde) is veranderd -- afgebroken, dat mag niet.';
  end if;
  if v_aantal_na <> 168 then
    raise exception 'Onverwacht aantal vragen na afloop: % (verwacht 168).', v_aantal_na;
  end if;

  raise notice 'SeysCentra vragen hernummerd: % vragen, inhoud-hash ongewijzigd.', v_aantal_na;
end $$;

commit;
