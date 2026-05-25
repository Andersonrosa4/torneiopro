-- Reclassifica entradas male/female nos rankings baseando-se no primeiro nome.
-- 1) Cria função auxiliar de detecção de gênero em PT-BR.
CREATE OR REPLACE FUNCTION public.detect_pt_gender(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  first text;
  norm text;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RETURN NULL; END IF;
  first := split_part(btrim(_name), ' ', 1);
  norm := lower(unaccent(first));

  IF norm = ANY (ARRAY[
    'simeao','davi','guilherme','kaira','silmar','timoteo','pietro','edu','eduardo','juliano',
    'vitor','victor','lucas','renan','joao','luis','luiz','oswaldo','osvaldo','felipe','fernando',
    'gilberto','junior','leonardo','rogerio','wallace','pedro','nilmar','charles','ian','rafael',
    'dilamar','vinicius','daniel','anderson','tayson','gabriel','allyson','mario','marcio','eydrian',
    'halan','carlos','dirceu','arthur','artur','tiago','thiago','ricardo','roberto','marcos','marcelo',
    'bruno','matheus','mateus','gustavo','henrique','rodrigo','diego','alexandre','andre','antonio',
    'paulo','jorge','leandro','tarcisio','douglas','everton','cesar','fabio','alex','alan','adriano',
    'cristiano','emanuel','jonas','jonathan','jefferson','kleber','murilo','nathan','nicolas','otavio',
    'raul','renato','samuel','sergio','valter','walter'
  ]) THEN
    RETURN 'male';
  END IF;

  IF norm = ANY (ARRAY[
    'claudia','stefany','elisandra','raquel','veronilce','aline','laura','carina','camila','samira',
    'tauane','andreia','paola','ane','dejanira','joana','luana','thais','helena','sabrina','bianca',
    'josieli','sheila','scheila','ana','michele','kethelin','isadora','eduarda','taicline','juliana',
    'rafaela','julia','deisi','vitoria','veronica','andressa','natalia','helen','adriane','barbara',
    'danielly','francieli','gabrielle','gabrielly','jaqueline','jessica','keyla','lillian','luiza',
    'manoella','maria','mariana','nicole','nicoly','olga','patricia','roshane','vanessa','amanda',
    'aparecida','beatriz','bruna','carla','carolina','catarina','cecilia','cintia','clara','cristina',
    'daniela','debora','edna','eliane','elaine','elisa','eloa','emanuela','fabiana','fatima','fernanda',
    'flavia','gabriela','geovana','giovana','giulia','graziela','heloisa','ines','ingrid','irene',
    'jacqueline','janaina','kelly','larissa','leticia','livia','lorena','lucia','luciana','mara',
    'marcela','marcia','margarida','mariane','marilia','marina','marlene','marta','melissa','michelle',
    'milena','monica','monique','nadia','natasha','nayara','nina','nubia','olivia','paula','priscila',
    'raissa','rebeca','regina','renata','roberta','rosa','rosana','sandra','silvia','simone','sonia',
    'sueli','suzana','taina','tamires','tatiane','teresa','valentina','valeria','vania','viviane',
    'yara','yasmin'
  ]) THEN
    RETURN 'female';
  END IF;

  -- Heurística por terminação
  IF norm ~ '[a]$' THEN RETURN 'female'; END IF;
  IF norm ~ '[ozrlnms]$' THEN RETURN 'male'; END IF;
  RETURN NULL;
END;
$$;

-- Garante extensão unaccent
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Recria a função usando extensions.unaccent
CREATE OR REPLACE FUNCTION public.detect_pt_gender(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  first text;
  norm text;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RETURN NULL; END IF;
  first := split_part(btrim(_name), ' ', 1);
  norm := lower(extensions.unaccent(first));

  IF norm = ANY (ARRAY[
    'simeao','davi','guilherme','kaira','silmar','timoteo','pietro','edu','eduardo','juliano',
    'vitor','victor','lucas','renan','joao','luis','luiz','oswaldo','osvaldo','felipe','fernando',
    'gilberto','junior','leonardo','rogerio','wallace','pedro','nilmar','charles','ian','rafael',
    'dilamar','vinicius','daniel','anderson','tayson','gabriel','allyson','mario','marcio','eydrian',
    'halan','carlos','dirceu','arthur','artur','tiago','thiago','ricardo','roberto','marcos','marcelo',
    'bruno','matheus','mateus','gustavo','henrique','rodrigo','diego','alexandre','andre','antonio',
    'paulo','jorge','leandro','tarcisio','douglas','everton','cesar','fabio','alex','alan','adriano',
    'cristiano','emanuel','jonas','jonathan','jefferson','kleber','murilo','nathan','nicolas','otavio',
    'raul','renato','samuel','sergio','valter','walter'
  ]) THEN
    RETURN 'male';
  END IF;

  IF norm = ANY (ARRAY[
    'claudia','stefany','elisandra','raquel','veronilce','aline','laura','carina','camila','samira',
    'tauane','andreia','paola','ane','dejanira','joana','luana','thais','helena','sabrina','bianca',
    'josieli','sheila','scheila','ana','michele','kethelin','isadora','eduarda','taicline','juliana',
    'rafaela','julia','deisi','vitoria','veronica','andressa','natalia','helen','adriane','barbara',
    'danielly','francieli','gabrielle','gabrielly','jaqueline','jessica','keyla','lillian','luiza',
    'manoella','maria','mariana','nicole','nicoly','olga','patricia','roshane','vanessa','amanda',
    'aparecida','beatriz','bruna','carla','carolina','catarina','cecilia','cintia','clara','cristina',
    'daniela','debora','edna','eliane','elaine','elisa','eloa','emanuela','fabiana','fatima','fernanda',
    'flavia','gabriela','geovana','giovana','giulia','graziela','heloisa','ines','ingrid','irene',
    'jacqueline','janaina','kelly','larissa','leticia','livia','lorena','lucia','luciana','mara',
    'marcela','marcia','margarida','mariane','marilia','marina','marlene','marta','melissa','michelle',
    'milena','monica','monique','nadia','natasha','nayara','nina','nubia','olivia','paula','priscila',
    'raissa','rebeca','regina','renata','roberta','rosa','rosana','sandra','silvia','simone','sonia',
    'sueli','suzana','taina','tamires','tatiane','teresa','valentina','valeria','vania','viviane',
    'yara','yasmin'
  ]) THEN
    RETURN 'female';
  END IF;

  IF norm ~ '[a]$' THEN RETURN 'female'; END IF;
  IF norm ~ '[ozrlnms]$' THEN RETURN 'male'; END IF;
  RETURN NULL;
END;
$$;

-- 2) Atualiza entry_type das linhas existentes onde o gênero detectado difere.
UPDATE public.rankings r
SET entry_type = public.detect_pt_gender(r.athlete_name)
WHERE r.entry_type IN ('male','female')
  AND public.detect_pt_gender(r.athlete_name) IS NOT NULL
  AND public.detect_pt_gender(r.athlete_name) <> r.entry_type;

-- 3) Remove linhas em male/female onde não foi possível detectar gênero (evita classificação errada).
DELETE FROM public.rankings r
WHERE r.entry_type IN ('male','female')
  AND public.detect_pt_gender(r.athlete_name) IS NULL;