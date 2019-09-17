const async = require("async");
const AWS = require("aws-sdk");
const multipart = require("parse-multipart");
const gm = require("gm").subClass({ imageMagick: true });
const s3 = new AWS.S3();

// constants
const MAX_WIDTH = 500;
const MAX_HEIGHT = 500;
const DEFAULT_QUALITY = 90; // try to keep the quality
const DEFAULT_SCALING_FACTOR = 0.8;

exports.handler = function(event, context, callback) {
  const bodyBuffer = new Buffer(event["body-json"].toString(), "base64");

  const boundary = multipart.getBoundary(event.params.header["content-type"]);
  const parts = multipart.Parse(bodyBuffer, boundary);

  if (parts.length < 1) {
    callback("No file selected");
    return;
  }

  const image = parts[0];
  const imageData = image.data;
  const fileName = (image.filename || "").toLowerCase();
  const imageType = fileName.split(".").pop();
  // Get FullYear, Month
  const currentTime = new Date();
  const year = currentTime.getFullYear();
  const month = ("0" + (currentTime.getMonth() + 1)).slice(-2);

  // Check the type of image
  if (imageType != "jpg" && imageType != "jpeg" && imageType != "png") {
    callback(`Unsupported image type: ${imageType}`);
    return;
  }
  const newFileName = fileName.substr(0, fileName.lastIndexOf(".")) + ".jpg";
  const path = `${year}/${month}/${newFileName}`;

  async.waterfall(
    [
      function transform(next) {
        gm(imageData).size(function(err, size) {
          if (err) {
            next(err);
            return;
          }

          // Infer the scaling factor to avoid stretching the image unnaturally.
          let scalingFactor = Math.min(
            MAX_WIDTH / size.width,
            MAX_HEIGHT / size.height
          );

          scalingFactor = Math.min(DEFAULT_SCALING_FACTOR, scalingFactor);

          const width = scalingFactor * size.width;
          const height = scalingFactor * size.height;

          // Transform the image buffer in memory.
          this.resize(width, height)
            .quality(DEFAULT_QUALITY)
            .toBuffer("JPG", function(err, buffer) {
              if (err) {
                next(err);
              } else {
                next(null, "image/jpeg", buffer);
              }
            });
        });
      },
      function upload(contentType, data, next) {
        // Stream the transformed image to a different S3 bucket.
        const params = {
          Bucket: "xxxx",
          Key: path,
          Body: data,
          ContentType: contentType
        };
        const s3UploadPromise = s3.upload(params).promise();
        s3UploadPromise
          .then(res =>
            callback(null, { result: "SUCCESS", files: res.Location })
          )
          .catch(err => next(err));
      }
    ],
    function(err) {
      if (err) {
        console.error(`Error: ${err}`);
      } else {
        console.log("Success");
      }

      callback(null, "message");
    }
  );
};
