<?php
$name = get_option('contact_name', 'Jane Doe');
$email = get_option('contact_email', 'jane@example.com');
$phone = get_option('contact_phone', '');
?>
<div class="contact-card">
    <h3><?php echo esc_html($name); ?></h3>
    <p><?php echo esc_html($email); ?></p>
    <?php if ($phone): ?>
    <p><?php echo $phone; ?></p>
    <?php endif; ?>
</div>
