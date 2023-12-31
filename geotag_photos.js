function findNearestTime(currentDateTime, times) {
  // Get the difference between the current date and time and each time in the list of times.
  const differences = times.map((time) => {
    return Math.abs(currentDateTime - new Date(time));
  });

  // Find the smallest difference.
  const smallestDifference = Math.min(...differences);

  // Find the index of the smallest difference.
  const smallestDifferenceIndex = differences.indexOf(smallestDifference);

  // Return the time at the index of the smallest difference.
  return times[smallestDifferenceIndex];
}

function dataURItoBlob(dataURI) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURI.split(',')[1]);

  // separate out the mime component
  var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);

  // create a view into the buffer
  var ia = new Uint8Array(ab);

  // set the bytes of the buffer to the correct values
  for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
  }

  // write the ArrayBuffer to a blob, and you're done
  var blob = new Blob([ab], {type: mimeString});
  return blob;

}

function geotagPhotos() {
  // Test validity
  information = document.getElementById('information');
  gpx_button = document.getElementById('gpxFile');
  photos_button = document.getElementById('photoFiles');
  if (gpx_button.files.length == 0) {
    information.textContent = 'No gpx file choosen';
    return;
  }
  else if (photos_button.files.length == 0) {
    information.textContent = 'No jpeg files choosen';
    return;
  }
  else {
    information.textContent = 'Processing...';
  }

  // Read the GPX file
  const gpxFile = gpx_button.files[0];
  const reader = new FileReader();

  reader.onload = function() {
    const gpxText = reader.result;

    // Parse the GPX text
    const gpxParser = new DOMParser();
    const gpxDoc = gpxParser.parseFromString(gpxText, 'text/xml');

    // Get the list of coordinates and time from the GPX file
    const coordinates = [];
    const times = [];
    for (const trackpoint of gpxDoc.querySelectorAll('trkpt')) {
      coordinates.push({
        latitude: trackpoint.getAttribute('lat'),
        longitude: trackpoint.getAttribute('lon'),
        time: trackpoint.querySelector('time').textContent
      });
      times.push(trackpoint.querySelector('time').textContent);
    }

    min_time = Math.min.apply(null, times.map(function(time) {
      return +new Date(time);
    }));
    max_time = Math.max.apply(null, times.map(function(time) {
      return +new Date(time);
    }));

    // Get the list of photos from the local drive
    const photoFiles = photos_button.files;
    var num_files = photoFiles.length;

    // Create a zip file
    var zip = new JSZip();

    // Geotag each photo and add it to the zip file
    for (const photoFile of photoFiles) {
      // Convert the File object to an ArrayBuffer
      const reader = new FileReader();
      reader.onloadend = function(e) {
        // Get the EXIF data from the ArrayBuffer
        var file_data = e.target.result;
        var exif = piexif.load(file_data);

        // Skip photos that have GPS coordinates
        if (exif.GPS[piexif.GPSIFD.GPSLatitude] === undefined) {
          // Get the photo's time from the EXIF data
          const photoTime = moment(exif.Exif[piexif.ExifIFD.DateTimeOriginal], 'YYYY:MM:DD HH:mm:ss');

          // Skip photos that were taken outside of track time frame
          if (Math.abs(photoTime.toDate() - min_time) < 900000 || 
              Math.abs(photoTime.toDate() - max_time) < 900000) { // 15 minutes
            // Find the nearest time in the GPX file
            const nearestTime = findNearestTime(new Date(photoTime), times);

            // If there is a nearest time, geotag the photo
            if (nearestTime) {
              const nearestCoordinate = coordinates.find((coordinate) => {
                return coordinate.time === nearestTime;
              });

              exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = nearestCoordinate.latitude < 0 ? 'S' : 'N';
              exif.GPS[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(nearestCoordinate.latitude);
              exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = nearestCoordinate.longitude < 0 ? 'W' : 'E';
              exif.GPS[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(nearestCoordinate.longitude);

              var exifbytes = piexif.dump(exif);
              // piexif.remove(file_data);
              var updated_file = piexif.insert(exifbytes, file_data);
              const file_blob = dataURItoBlob(updated_file);

              // Add the photo to the zip file with the geotagged coordinates
              zip.file(photoFile.name, file_blob, {"base64": true});

              // Download the zip file
              if (Object.keys(zip.files).length == num_files) {
                zip.generateAsync({ type: 'blob' }).then((blob) => {
                    const url = URL.createObjectURL(blob);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = url;
                    downloadLink.download = 'geotagged_photos.zip';
                    downloadLink.click();
                    information.textContent = 'Done!';
                });
              }
            }
          }
          else {
            num_files = num_files - 1;
          }
        }
        else {
          num_files = num_files - 1;
        }
        if (num_files == 0) {
          information.textContent = 'No photo was without GPS coordinates and matched to gpx minimum and maximum timestamps';
        }    
      };

      reader.readAsDataURL(photoFile);
    }
  };

  reader.readAsText(gpxFile);
}

function chooseGpx() {
  information = document.getElementById('information');
  gpx_button = document.getElementById('gpxFile');
  const gpxFile = gpx_button.files[0].name;
  information.textContent = `gpx file ${gpxFile} selected`;
}

function chooseJpegs() {
  information = document.getElementById('information');
  photos_button = document.getElementById('photoFiles');
  const photoFiles = photos_button.files;
  var num_files = photoFiles.length;
  information.textContent = `${num_files} photos selected`;
}