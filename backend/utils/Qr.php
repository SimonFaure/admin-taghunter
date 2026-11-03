<?php
/** PNG QR codes for booking emails (chillerlan/php-qrcode, GD). */
class Qr {
    /** Raw PNG bytes encoding $text. */
    public static function png(string $text, int $scale = 8): string {
        require_once __DIR__ . '/../vendor/autoload.php';
        $options = new \chillerlan\QRCode\QROptions([
            'outputType' => \chillerlan\QRCode\Output\QROutputInterface::GDIMAGE_PNG,
            'eccLevel' => \chillerlan\QRCode\Common\EccLevel::M,
            'scale' => $scale,
            'quietzoneSize' => 2,
            'outputBase64' => false,
        ]);
        return (new \chillerlan\QRCode\QRCode($options))->render($text);
    }
}
