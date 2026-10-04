-- The Intelligence feed has three types: Incident, News and Opportunity.
-- Advisories were opportunities logged under the old default type; breaches are
-- incidents; information items are news.
UPDATE intel_feed SET severity = 'Opportunity', severity_kind = 'secure' WHERE severity_kind = 'advisory';
UPDATE intel_feed SET severity = 'Incident', severity_kind = 'breach' WHERE severity_kind = 'breach';
UPDATE intel_feed SET severity = 'News', severity_kind = 'info' WHERE severity_kind NOT IN ('secure', 'breach');
UPDATE intel_feed SET severity = 'Opportunity' WHERE severity_kind = 'secure';
