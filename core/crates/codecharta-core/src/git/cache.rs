use std::collections::VecDeque;

/// A small least-recently-used cache; lookups are linear, so keep the capacity in the hundreds.
#[derive(Debug)]
pub struct LruCache<Key, Value> {
    capacity: usize,
    most_recent_first: VecDeque<(Key, Value)>,
}

impl<Key: PartialEq, Value> LruCache<Key, Value> {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            most_recent_first: VecDeque::with_capacity(capacity),
        }
    }

    pub fn get(&mut self, key: &Key) -> Option<&Value> {
        let position = self.position(key)?;
        let entry = self.most_recent_first.remove(position)?;
        self.most_recent_first.push_front(entry);
        self.most_recent_first.front().map(|(_, value)| value)
    }

    pub fn insert(&mut self, key: Key, value: Value) {
        if let Some(position) = self.position(&key) {
            self.most_recent_first.remove(position);
        }
        self.most_recent_first.push_front((key, value));
        self.most_recent_first.truncate(self.capacity);
    }

    pub fn len(&self) -> usize {
        self.most_recent_first.len()
    }

    pub fn is_empty(&self) -> bool {
        self.most_recent_first.is_empty()
    }

    fn position(&self, key: &Key) -> Option<usize> {
        self.most_recent_first
            .iter()
            .position(|(existing, _)| existing == key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_evict_least_recently_used() {
        // Arrange
        let mut cache = LruCache::new(2);
        cache.insert("a", 1);
        cache.insert("b", 2);
        cache.get(&"a");

        // Act
        cache.insert("c", 3);

        // Assert
        assert_eq!(cache.get(&"b"), None);
        assert_eq!(cache.get(&"a"), Some(&1));
        assert_eq!(cache.get(&"c"), Some(&3));
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn should_replace_the_value_of_a_known_key() {
        // Arrange
        let mut cache = LruCache::new(2);
        cache.insert("a", 1);

        // Act
        cache.insert("a", 2);

        // Assert
        assert_eq!(cache.get(&"a"), Some(&2));
        assert_eq!(cache.len(), 1);
    }
}
