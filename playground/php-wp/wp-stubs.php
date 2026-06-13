<?php
$filters = [];

function add_filter($tag, $callback, $priority = 10, $accepted_args = 1) {
    global $filters;
    if (!isset($filters[$tag])) {
        $filters[$tag] = [];
    }
    $filters[$tag][] = ['callback' => $callback, 'priority' => $priority, 'accepted_args' => $accepted_args];
}

function remove_filter($tag, $callback, $priority = 10) {
    global $filters;
    if (!isset($filters[$tag])) return false;
    foreach ($filters[$tag] as $i => $entry) {
        if ($entry['callback'] === $callback && $entry['priority'] === $priority) {
            unset($filters[$tag][$i]);
            $filters[$tag] = array_values($filters[$tag]);
            return true;
        }
    }
    return false;
}

function apply_filters($tag, $value, ...$args) {
    global $filters;
    if (!isset($filters[$tag])) return $value;
    $sorted = $filters[$tag];
    usort($sorted, fn($a, $b) => $a['priority'] - $b['priority']);
    foreach ($sorted as $entry) {
        $value = call_user_func($entry['callback'], $value, ...$args);
    }
    return $value;
}

$shortcodes = [];
function add_shortcode($tag, $callback) {
    global $shortcodes;
    $shortcodes[$tag] = $callback;
}
function do_shortcode_tag($tag, $atts = []) {
    global $shortcodes;
    if (!isset($shortcodes[$tag])) return '';
    return call_user_func($shortcodes[$tag], $atts);
}
function shortcode_atts($pairs, $atts, $shortcode = '') {
    $out = [];
    foreach ($pairs as $key => $default) {
        $out[$key] = array_key_exists($key, $atts) ? $atts[$key] : $default;
    }
    return $out;
}
function get_option($key, $default = false) { return $default; }
function esc_html($text) { return htmlspecialchars($text, ENT_QUOTES, 'UTF-8'); }
function esc_attr($text) { return htmlspecialchars($text, ENT_QUOTES, 'UTF-8'); }
function absint($v) { return abs((int)$v); }
function sanitize_text_field($str) { return strip_tags($str); }
function wp_kses_post($str) { return $str; }
function do_shortcode($content) { return $content; }
function update_option($key, $value) { return true; }
function get_posts($args = []) {
    $count = isset($args['numberposts']) ? (int)$args['numberposts'] : 5;
    $count = max(1, min(10, $count));
    $posts = [];
    for ($i = 1; $i <= $count; $i++) {
        $post = new stdClass();
        $post->post_title = "Post Title $i";
        $post->ID = $i;
        $posts[] = $post;
    }
    return $posts;
}
function register_setting($group, $option) {}
function add_settings_section($id, $title, $callback, $page) {}
function add_settings_field($id, $title, $callback, $page, $section) {}
