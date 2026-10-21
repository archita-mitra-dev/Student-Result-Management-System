-- Students see the version that was last published. While a correction is open on a
-- locked or published offering, the previously published version stays visible.
ALTER TABLE subject_offerings ADD COLUMN published_version INT;
