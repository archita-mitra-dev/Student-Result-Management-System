-- PLACEHOLDER grading bands so the system is usable before configuration.
-- These are NOT official thresholds. The institution must confirm or replace them in Admin > Grading.
-- Until then is_placeholder stays TRUE and the admin dashboard shows a warning.
INSERT INTO grading_schemes (name, is_active, is_placeholder, pass_marks_percent)
VALUES ('Placeholder bands (awaiting institutional configuration)', TRUE, TRUE, 40);

INSERT INTO grading_bands (scheme_id, letter, min_marks, grade_point, is_pass)
SELECT id, b.letter, b.min_marks, b.gp, b.pass FROM grading_schemes,
  (VALUES ('O',90,10,TRUE),('E',80,9,TRUE),('A',70,8,TRUE),('B',60,7,TRUE),('C',50,6,TRUE),('D',40,5,TRUE),('F',0,0,FALSE)) AS b(letter,min_marks,gp,pass)
WHERE is_active;
