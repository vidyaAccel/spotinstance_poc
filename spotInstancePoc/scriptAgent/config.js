module.exports = {
  Platform : 'Linux/UNIX',
  Increment : 1,
  repository: 'spotpoc/poc:v36',
  RequestType: 'one-time',
  InstanceCount: '1',
  Specification : {
    InstanceType: "m3.medium",
    Placement: {
      AvailabilityZone: "us-west-2a"
    },
    ImageId: "ami-5b4c5d22",
    SecurityGroupIds: ["sg-42558938"],
    KeyName: "tsgpoc-key",
    Monitoring: {
      Enabled: true
    }
  }
}