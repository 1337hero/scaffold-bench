<?php
$post_date = get_option('post_date', date('Y-m-d'));
$category = get_option('post_category', 'Uncategorized');
?>
<div class="post-meta">
    <span class="date"><?php echo esc_html($post_date); ?></span>
    <span class="category"><?php echo esc_html($category); ?></span>
</div>
