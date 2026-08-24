-- ============================================================
-- Migration : corriger les sender_id inversés dans les messages
-- 
-- Problème : les anciens messages utilisaient getMyProfileId()
-- (mapping inversé) pour le sender_id. Le JOIN profiles!sender_id
-- retournait donc le MAUVAIS display_name.
--
-- Correction : inverser les deux UUIDs de profil dans tous les
-- messages existants pour que chaque message pointe vers le
-- VRAI profil de l'expéditeur.
--
-- Profils web :
--   3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c = M (femme)
--   0edca7b6-262c-4c0b-b638-a061c937536c = H (homme)
-- ============================================================

-- 1. Voir l'état actuel
SELECT sender_id, COUNT(*) as count
FROM messages
WHERE sender_id IN ('3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c', '0edca7b6-262c-4c0b-b638-a061c937536c')
GROUP BY sender_id;

-- 2. Inverser les sender_id (l'ancien mapping inversé → mapping correct)
UPDATE messages
SET sender_id = CASE
  WHEN sender_id = '3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c' THEN '0edca7b6-262c-4c0b-b638-a061c937536c'
  WHEN sender_id = '0edca7b6-262c-4c0b-b638-a061c937536c' THEN '3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c'
  ELSE sender_id
END
WHERE sender_id IN ('3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c', '0edca7b6-262c-4c0b-b638-a061c937536c');

-- 3. Vérifier le résultat
SELECT sender_id, COUNT(*) as count
FROM messages
WHERE sender_id IN ('3cd819d0-1ca8-4f0a-aa16-b8eb8e572b1c', '0edca7b6-262c-4c0b-b638-a061c937536c')
GROUP BY sender_id;

-- 4. (Optionnel) Aussi corriger les message_status si nécessaire
-- Les message_status utilisent profile_id pour "qui a reçu" —
-- ça n'a pas besoin d'être inversé car c'est le destinataire,
-- pas l'expéditeur.
