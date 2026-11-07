-- gen_short_id() sert de valeur par défaut (code, jetons) : évaluée avec les droits de l'appelant,
-- donc service_role doit pouvoir l'exécuter. (La migration init révoque EXECUTE à public.)
grant execute on all functions in schema public to service_role;
