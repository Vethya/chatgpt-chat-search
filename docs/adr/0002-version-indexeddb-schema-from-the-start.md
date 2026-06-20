# Version IndexedDB schema from the start

The Conversation Database uses explicit versioning and migrations from the first implementation. IndexedDB already requires versioned upgrades, and recording schema changes intentionally makes future content indexing safer.
