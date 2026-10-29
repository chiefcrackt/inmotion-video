import { Encoder, Profile } from '@garmin/fitsdk';
export const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Synthetic test run</name><trkseg>${Array.from({ length: 30 }, (_, i) => `<trkpt lat="${40 + i * 0.0001}" lon="${-74 + Math.sin(i / 5) * 0.002}"><ele>${100 + i}</ele><time>${new Date(Date.UTC(2026, 0, 1) + i * 10000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${130 + i}</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('')}</trkseg></trk></gpx>`;
export const tcx = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-01-01T00:00:00Z</Id><Lap StartTime="2026-01-01T00:00:00Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><Track><Trackpoint><Time>2026-01-01T00:00:00Z</Time><Position><LatitudeDegrees>40</LatitudeDegrees><LongitudeDegrees>-74</LongitudeDegrees></Position><DistanceMeters>0</DistanceMeters></Trackpoint><Trackpoint><Time>2026-01-01T00:05:00Z</Time><Position><LatitudeDegrees>40.01</LatitudeDegrees><LongitudeDegrees>-74</LongitudeDegrees></Position><DistanceMeters>1000</DistanceMeters><HeartRateBpm><Value>145</Value></HeartRateBpm></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
export function fitFixture() {
  const e = new Encoder();
  e.onMesg(Profile.MesgNum.FILE_ID, {
    type: 'activity',
    manufacturer: 'garmin',
    product: 1,
    serialNumber: 123,
    timeCreated: new Date('2026-01-01T00:00:00Z'),
  });
  for (let i = 0; i < 6; i++)
    e.onMesg(Profile.MesgNum.RECORD, {
      timestamp: new Date(Date.UTC(2026, 0, 1) + i * 10000),
      positionLat: Math.round(((40 + i * 0.0001) / 180) * 2147483648),
      positionLong: Math.round((-74 / 180) * 2147483648),
      distance: i * 100,
      heartRate: 140 + i,
      cadence: 85,
      altitude: 100 + i,
      power: 250,
    });
  e.onMesg(Profile.MesgNum.SESSION, {
    sport: 'running',
    startTime: new Date('2026-01-01T00:00:00Z'),
    timestamp: new Date('2026-01-01T00:00:50Z'),
    totalDistance: 500,
    totalElapsedTime: 50,
    totalTimerTime: 45,
    totalAscent: 5,
    avgCadence: 85,
  });
  return e.close();
}
