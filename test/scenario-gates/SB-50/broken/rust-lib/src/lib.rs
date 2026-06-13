pub fn total_length(words: Vec<String>) -> usize {
    words.iter().map(|w| w.len()).sum()
}

pub fn report(words: Vec<String>) -> String {
    let count = total_length(words);
    format!("total chars: {}, word count: {}", count, words.len())
}

pub fn running_totals(values: &[i64]) -> Vec<i64> {
    let n = values.len();
    values.iter()
        .scan(0i64, |acc, &x| { *acc += x; Some(*acc) })
        .take(n - 1)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_running_totals() {
        assert_eq!(running_totals(&[1, 2, 3, 4]), vec![1, 3, 6, 10]);
    }

    #[test]
    fn test_total_length() {
        let words = vec!["hello".to_string(), "world".to_string()];
        let _ = total_length(words);
    }
}
